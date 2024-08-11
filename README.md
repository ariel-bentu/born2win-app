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

## Manage Webhook for users airtable
- run `export auth=<api-key>`
``` bash
curl -X POST "https://api.airtable.com/v0/bases/app5CI9AWJKt1ZwTy/webhooks" \
-H "Authorization: Bearer $auth" \
-H "Content-Type: application/json" \
--data '{
    "notificationUrl": "https://europe-west1-born2win-1.cloudfunctions.net/httpApp/airtable/users/",
    "specification": {
      "options": {
        "filters": {
          "dataTypes": [
            "tableData"
          ],
          "recordChangeScope": "tbl9djJMEErRLjrjk"
        }
      }
    }
  }'
```