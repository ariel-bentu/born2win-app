# Born to Win App
an pwa to serve the non-profit organization born2win.



# Firebase setup
- Setup new project (e.g. born2win)
- Upgrade to "blaze" (requires credit card)
- In "Project Settings":
  - Cloud messaging -> WebPush certificate: generate key. then copy the keypair presented (e.g. "BKoNH8dLa3kdG_u6ZPU1AAM56o4SCqmhXYkTwGwpI8VIEHx5xAQek4HhKVpPTb-dhMBPwM761w6T57tPPisLQL8") to the `api.tsx` as `VAPID_KEY`
  - General -> create a new web-based app (e.g. name=born2win) and copy the `const firebaseConfig = {...}` to `api.tsx`
  - Service Accounts: Generate new private-key and store in a safe place (this is useful to access the account e.g from `ops.js`)
  - Users and Permissions - add more project contributors.
- Firestore: create a new DB. production mode.
- in file `.firebaserc` change the default project to what you created
- register a webhook (see below), and update your `.env.<proj-id>` - it should be in the `functions` folder and have these keys:
```
BORN2WIN_API_KEY=<air-table apikey>
BORM2WIN_MAIN_BASE=app5CI9AWJKt1ZwTy
BORM2WIN_AT_WEBHOOK_USERS_ID=<webhook id>
BORM2WIN_AT_WEBHOOK_USERS_MAC=<webhook secret>
```
- Authentication: enable anonymous-logins
- Storage: 
  - enable the service
  - create folder gallery
  - change the rules to:
  ```
  service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.isAdmin == true;
    }
  }
}
```
  - Setup CORS rules. `gsutil cors set cors.json gs://born2win-prod.appspot.com` - you need to install [gcloud](https://cloud.google.com/sdk/docs/install)

# Development Instructions
## Run locally 
- run `npm start`
- open chrome on `http://localhost:3000?vid=<volunteerId>&otp=<devOtp in DB>&dev=true`

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
    "notificationUrl": "https://europe-west1-born2win-prod.cloudfunctions.net/httpApp/airtable/users/",
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

## Setup custom domain for the site
1. In firebase hosting, add custom domain
2. Add a CNAME in the born2win.org.il domain pointing to the web.app domain of the firebase project