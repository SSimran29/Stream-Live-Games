#  Stream Live Games 01/25/2025 - 05/20/2025 (College Project)

Stream Live Games is a full-stack web app that connects game discovery with live streaming. The user picks a genre, the app recommends a random game from the RAWG.io API, and then finds a live Twitch stream of that game through the Twitch API and embeds it on the page.

---

## Features
- Recommends a random game (name, cover image, rating, release date) from a chosen genre using the RAWG.io API
- Offers 15 preset genres plus an “Other” option for typed input. A typed genre is first matched against RAWG’s genres, and otherwise checked as a Twitch category
- Finds a live Twitch stream for the game and shows the streamer, viewer count, stream title, and an embedded player
- Only shows a stream when the game name matches a Twitch category exactly, so it never shows the wrong game
- Handles empty results, such as no games found or no one streaming, with clear messages
- Authenticates with Twitch using the OAuth client-credentials flow, and caches the token until it nearly expires
- Keeps API keys on the server, loaded from environment variables or a local credentials.json
- Builds page content with safe DOM methods rather than innerHTML, so API data can’t inject HTML
- Uses asynchronous API calls with async/await and the built-in fetch

---

## Tech Stack
**Frontend:** HTML,CSS, JavaScript  
**Backend:** Node.js
**APIs:** RAWG.io API, Twitch API  
**Tools:** VS Code 
