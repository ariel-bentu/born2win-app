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
example
```json
{
      "id": "recyT0GRTb4aOqiZE",
      "createdTime": "2024-06-19T07:38:31.000Z",
      "fields": {
        "Name": "משפחת דוגמא",
        "גיל החולה": "61",
        "שם פרטי של החולה": "שם פרטי ",
        "שם משפחה של החולה": "שם משפחה",
        "עיר": "יבנה",
        "כשרות מטבח": "אין צורך בהפרדת כלים רק לא לערבב בבישול חלבי ובשרי",
        "רגישויות ואלרגיות (from בדיקת ההתאמה)": "\n",
        "דרישות לשיבוצים": [
          "reck1s4JbM1fouhpx",
          "recCEn90yMo6BBTyq",
          "rec2ENIyRirQ2WxRw",
          "recf7xpB7a5W3Gvn1",
          "rec64eNUmvcXYqyEI",
          "reccbLFW3hkAA9jhA",
          "reczFuHoeG7gC3m2N",
          "rec3f0mc5ltqqQO37",
          "rec6ixhliemj7Kwmc",
          "recqn14XlWe1PFxtN"
        ],
        "familyid": "recPSJYXnZVas4RLs",
        "מחוז": "מחוז מרכז",
        "רחוב": "כלשהו",
        "קומה": "2",
        "דירה": "11",
        "מספר דירה": "11",
        "ימים": [
          "יום חמישי"
        ],
        "Days of the Week": [
          "Thursday"
        ],
        "גילאים של הרכב המשפחה": "22",
        "הרכב הורים": [
          "זוג הורים"
        ],
        "תוספות": "אורז בסמטי ירקות בתנור, שעועית ירוקה כל הקטניות חומוס שעועית  ירקות עדשים ",
        "העדפות דגים": "כל הדגים",
        "העדפות בשר": "חזה עוף קציצות עוף הודו ממולאים עוף עוף מבושל או בתנור",
        "נפשות מבוגרים בבית": "2",
        "base_id": "appLTxCrbOFaAjmtW",
        "table_familyid": "tblEQ8mqmYXQKRdi7",
        "table_id": "tblPsuenDCZxqlLFz",
        "city_id_1": "recCrs1lxTEREEMsB",
        "שם עיר⛔": "כלשהי",
        "העדפה לסוג ארוחה": [
          "בשרי"
        ],
        "אוהבים לאכול": "אורז בסמטי ירקות בתנור, שעועית ירוקה כל הקטניות חומוס שעועית  ירקות עדשים , חזה עוף קציצות עוף הודו ממולאים עוף עוף מבושל או בתנור ,כל הדגים",
        "לא אוכלים": "מטוגן בשר אדום לחם לבן סוכר  אורז לבן פסטות\n",
        "סטטוס בעמותה": "לא פעיל",
        "record_id": "recyT0GRTb4aOqiZE",
        "ארוחות זמינות": 0,
        "סך ארוחות עתידיות": 0
      }
    },

```


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

