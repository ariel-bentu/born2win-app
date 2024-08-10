## Admins
- maintain in firebase admin and mahoz admins

## Sync users
- one time sync all active users
- implement a webhook that:
  - when changes to users table: read last day's modified records,
  - create/update users in firebase (fname, lname, id, mahoz, active, OTP)
  - if change is from inactive to active: issue a registration link with OTP and send to Mahoz's admin and main admin
  - refresh web-hook token

## Schdule tasks
- read all unfulfilled demands for the next 3 (?) days and send message to all Mahoz users
- remind users about their scheduled cooking?
- remind users to register for coocking - all, and maybe personalized

## App todo
- Implement OTP flow
- A new tab with booked cookings (past and future)
- Other languages (Arabic/English)?
- Optimize: 
  - Cache data when moving between tabs
  - Show progress when loading data


## Admin managing users
- able to deactivate user (do we need - we can react to inactive in airtable?)
- re-issue registration with OTP
- impersonate to any mahuz? have a list of missing schedules?


## Optimize server
- improve query for family demand 3 rest-calls to one rest call (having mahoz in users, and having mahuz's base in firebase/hardcoded)


## Setup
- github org
- move code into it
- add all collaborators to firebase
- maybe move firebase to born2win?
