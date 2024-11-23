import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

import { locale, addLocale, updateLocaleOption, updateLocaleOptions, localeOption, localeOptions } from 'primereact/api';
import he from 'primelocale/he.json'

import localeData from 'dayjs/plugin/localeData';
import dayjs from 'dayjs';
import ContactsManager from './families-mgmt';
require('dayjs/locale/he')


dayjs.extend(localeData);
dayjs.locale('he');
addLocale("he", he.he);


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  // <React.StrictMode>
      <App />
      // <ContactsManager userInfo={{
      //   id: "abc",
      //   firstName: "ariel",
      //   notificationToken: undefined,
      //   lastName: "bentu",
      //   notificationOn: false,
      //   phone: "0542277999",
      //   userDistrict: { id: "מרכז", name: "מרכז" },
      //   userDistricts: [],
      //   isAdmin: false,
      //   districts:[],
      //   active: true
      // }}/>
  // </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
