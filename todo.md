## Questions:
 


V- איך מתנהלים המחוזות? האם יש חלוקה גם בתוך מחוז?

- מה נדרש כדי לשבץ
  - message for thank you
  - in commitments - tel, address, contact איש קשר לתיאום לוגיססטי

V- האם מתנדבים מעיר אחת מבשלים גם למשפחות מעיר אחרת? אם כן האם גם מחוץ למחוז?
- מה קורה אם מתנדב נאלץ לבטל?
  - 



- initial registration for 1000 people? האם לכולם יש מייל?
  - integration with manychat to migration

## הודעות אוטומטיות
- מזל טוב ליומהולדת
- איזו תזכורות כדאי ליישם
- שבוע לפני – שולחת לכל מתנדבי המחוז? מתי את שולחת?
- סיפרת שאת שולחת בווטסאפ תזכורות לגבי משפחות שטרם שובצו להם מתנדבים. יכולה לפרט מה הקריטריון? למשל: כל המשפחות מהמחוז שלא שובצו - - - - 72 hours before - reminder

V- Manual sending to one, mahoz or all - 


## Admins
- maintain in firebase admin and mahoz admins

## Sync users
- one time sync all active users - V
- implement a webhook that:
  - when changes to users table: read last day's modified records, - V
  - create/update users in firebase (fname, lname, id, mahoz, active, OTP) - V
  - if change is from inactive to active: issue a registration link with OTP and send to Mahoz's admin and main admin
  - refresh web-hook token - V

## Schdule tasks
- read all unfulfilled demands for the next 3 (?) days and send message to all Mahoz users
- remind users about their scheduled cooking?
- remind users to register for coocking - all, and maybe personalized

## App todo
- Implement android install easier
    - check with chrome/Sumsung
- Implement OTP flow
- Other languages (Arabic/English)?
- Optimize: 
  - Cache data when moving between tabs
  - Show progress when loading data


## Admin managing users
- able to deactivate user (do we need - we can react to inactive in airtable?)
- re-issue registration with OTP
- impersonate to any mahuz? have a list of missing schedules?


## Setup
- github org
- move code into it
- add all collaborators to firebase
- maybe move firebase to born2win?


# Tables for each mahoz
משפחות במחוז
דרישות שיבוץ
example:
```json
{
      "id": "rec64eNUmvcXYqyEI",
      "createdTime": "2024-06-19T07:39:27.000Z",
      "fields": {
        "תאריך": "2024-07-18",
        "תעדוף": "1",
        "זמינות שיבוץ": "תפוס",
        "משפחה": [
          "recyT0GRTb4aOqiZE"
        ],
        "volunteer_id": "recpvp2E7B5yEywPi",
        "עיר": [
          "יבנה"
        ],
        "record_id (from משפחה)": [
          "recyT0GRTb4aOqiZE"
        ],
        "יום בשבוע1": "Thursday",
        "שם משפחה של החולה": [
          "אבג"
        ],
        "Family_id": [
          "recPSJYXnZVas4RLs"
        ],
        "id": "rec64eNUmvcXYqyEI",
        "formula_date_critical": "2024-07-18",
        "חודש": "July",
        "סטטוס בעמותה": [
          "לא פעיל"
        ],
        "Name": "אבג"
      }
    }
```