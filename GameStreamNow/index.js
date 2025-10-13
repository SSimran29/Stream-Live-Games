const fs = require("fs");
const http = require("http");
const https = require("https");
const url = require("url");
const querystring = require("querystring");

const credentials = require("./auth/credentials.json");

const port = 3000;
const server = http.createServer();

server.on("listening", listen_handler);
server.listen(port);
function listen_handler(){
    console.log(`Listening on Port ${port}`);
}

server.on("request", request_handler);
function request_handler(req, res) {
	console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
  // USER LANDING PAGE: Serve HTML form when user visits /
	if (req.url === "/") {
		const form = fs.createReadStream("html/index.html");
		res.writeHead(200, { "Content-Type": "text/html" });
		form.pipe(res);
	}
  //  FORM SUBMISSION: Handle /search?genre=
	else if (req.url.startsWith("/search")) {
		const { genre } = url.parse(req.url, true).query;
    //  BAD INPUT: Missing genre error
		if (!genre) return respond_404(res, "Missing genre parameter.");
    // PROCESS GENRE INPUT: Call RAWG
		get_game_recommendation(genre, res);
	}
	else {
		respond_404(res);
	}
}

function respond_404(res, msg = "Not Found") {
	res.writeHead(404, { "Content-Type": "text/html" });
	res.end(`<h1>404 - ${msg}</h1>`);
}


function get_game_recommendation(genre, res) {
  const rawgKey = credentials.rawg_api_key;
  // Fetch more games to allow random choice
  const rawgUrl = `https://api.rawg.io/api/games?key=${rawgKey}&genres=${encodeURIComponent(genre)}&page_size=10`;

  https.get(rawgUrl, (rawgRes) => {
      let rawgData = "";
      rawgRes.on("data", chunk => rawgData += chunk);
    
      rawgRes.on("end", () => {
          try {
              const parsed = JSON.parse(rawgData);
              if (!parsed.results || parsed.results.length === 0) {
                  res.writeHead(200, { "Content-Type": "text/html" });
                  return res.end(`<h2>No games found for genre: ${genre}</h2>`);
              }
              // Randomly pick one game from the list
              const randomIndex = Math.floor(Math.random() * parsed.results.length);
              const game = parsed.results[randomIndex];
              const gameName = game.name;

              fetchTwitchToken().then(token => {
                  search_twitch_game(gameName, token).then(gameId => {
                      if (!gameId) {
                          res.writeHead(200, { "Content-Type": "text/html" });
                          return res.end(`<h2>Game found: ${gameName}<br>No Twitch streams found for this game.</h2>`);
                      }
                      fetchTwitchLiveStream(gameId, token).then(stream => {
                          res.writeHead(200, { "Content-Type": "text/html" });
                          if (stream) {
                              // adding the stream player/video player

                              // EMBED TWITCH STREAM IF FOUND
                              const twitchEmbed = `
                                  <iframe
                                      src="https://player.twitch.tv/?channel=${stream.user_login}&parent=localhost"
                                      height="480"
                                      width="720"
                                      allowfullscreen>
                                  </iframe>`;
                              res.end(`
                                  <h2>Game Recommendation: ${gameName}</h2>
                                  <p>Live Streamer: <a href="https://twitch.tv/${stream.user_login}" target="_blank">${stream.user_name}</a><br>
                                  Title: ${stream.title}<br>
                                  Viewers: ${stream.viewer_count}</p>
                                  ${twitchEmbed}
                              `);
                          } else {
                              res.end(`
                                  <h2>Game Recommendation: ${gameName}</h2>
                                  <p>No live streams currently available for this game.</p>
                              `);
                          }
                      }).catch(err => {
                          res.writeHead(500);
                          res.end(`Error fetching Twitch live stream: ${err}`);
                      });
                  }).catch(err => {
                      res.writeHead(500);
                      res.end(`Error searching Twitch game: ${err}`);
                  });
              }).catch(err => {
                  res.writeHead(500);
                  res.end(`Error fetching Twitch token: ${err}`);
              });

          } catch (e) {
              res.writeHead(500);
              res.end("Failed to parse RAWG API response");
          }
      });
  }).on("error", (err) => {
      res.writeHead(500);
      res.end(`RAWG API request failed: ${err.message}`);
  });
}

// GET TWITCH OAUTH TOKEN
function fetchTwitchToken() {
  return new Promise((resolve, reject) => {
      const clientId = credentials.twitch_client_id;
      const clientSecret = credentials.twitch_client_secret;
      const data = querystring.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials"
      });

      const options = {
          hostname: "id.twitch.tv",
          path: "/oauth2/token",
          method: "POST",
          headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Content-Length": data.length
          }
      };

      const req = https.request(options, (res) => {
          let body = "";
          res.on("data", chunk => body += chunk);
          res.on("end", () => {
              if (res.statusCode !== 200) {
                  return reject(`Failed to get token: ${res.statusCode}`);
              }
              try {
                  const json = JSON.parse(body);
                  resolve(json.access_token);// capture token
              } catch (e) {
                  reject("Failed to parse token response");
              }
          });
      });

      req.on("error", reject);
      req.write(data);
      req.end();
  });
}

// TWITCH GAME ID FETCH
function search_twitch_game(gameName, token) {
  return new Promise((resolve, reject) => {
      const clientId = credentials.twitch_client_id;
      const encodedName = encodeURIComponent(gameName);
      const options = {
          hostname: "api.twitch.tv",
          path: `/helix/games?name=${encodedName}`,
          method: "GET",
          headers: {
              "Client-ID": clientId,
              "Authorization": `Bearer ${token}`
          }
      };

      https.get(options, (res) => {
          let body = "";
          res.on("data", chunk => body += chunk);
          res.on("end", () => {
              if (res.statusCode !== 200) return reject(`Twitch game search failed: ${res.statusCode}`);
              try {
                  const json = JSON.parse(body);
                  if (json.data && json.data.length > 0) {
                      resolve(json.data[0].id); // Return the Twitch game ID
                  } else {
                      resolve(null);
                  }
              } catch (e) {
                  reject("Failed to parse Twitch game search response");
              }
          });
      }).on("error", reject);
  });
}

//  GET TWITCH LIVE STREAM DATA
function fetchTwitchLiveStream(gameId, token) {
  return new Promise((resolve, reject) => {
      const clientId = credentials.twitch_client_id;
      const options = {
          hostname: "api.twitch.tv",
          path: `/helix/streams?game_id=${gameId}&first=1`,
          method: "GET",
          headers: {
              "Client-ID": clientId,
              "Authorization": `Bearer ${token}`
          }
      };

      https.get(options, (res) => {
          let body = "";
          res.on("data", chunk => body += chunk);
          res.on("end", () => {
              if (res.statusCode !== 200) return reject(`Twitch streams fetch failed: ${res.statusCode}`);
              try {
                  const json = JSON.parse(body);
                  if (json.data && json.data.length > 0) {
                      resolve(json.data[0]); // Return the first live stream object
                  } else {
                      resolve(null);
                  }
              } catch (e) {
                  reject("Failed to parse Twitch streams response");
              }
          });
      }).on("error", reject);
  });
}
