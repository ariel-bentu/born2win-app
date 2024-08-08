# Born to Win App
an pwa to serve the non-profit organization born2win.



# Development Instructions
## Run locally 
- run `npm start`
- open chrome on `http://localhost:3000?vol_id=<volunteerId>&dev=true`

## Deploy UI
- You need permission to the born2win firebase project and need to be logged in to firebase `firebase login`
- run `npm run build` and `npm run deploy`

## Deploy functions
- You need permission to the born2win firebase project and need to be logged in to firebase `firebase login`
- run `cd functions` and `npm run deploy` for all functions or e.g. `firebase deploy --only functions:UpdateUserLogin` for only one function

