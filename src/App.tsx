import { useEffect, useState } from 'react';
import './App.css';
import * as api from './api'
import { NextOrObserver, User } from 'firebase/auth';
const UID_STORAGE_KEY = "born2win_uid";
const VOL_ID_STORAGE_KEY = "born2win_vol_id";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [volunteerId, setVolunteerId] = useState<String | undefined>();

  const onAuth: NextOrObserver<User> = (user: User | null) => {
    setUser(user);
    if (user && user.uid) {
      // read from localStorage
      const currentUid = localStorage.getItem(UID_STORAGE_KEY);
      const currentVolId = localStorage.getItem(VOL_ID_STORAGE_KEY);

      const queryString = window.location.search;
      const urlParams = new URLSearchParams(queryString);
      const vol_id = urlParams.get('vol_id');

      if (vol_id && vol_id.length > 0) {
        if (vol_id !== currentVolId) {
          if (currentVolId && currentVolId.length > 0) {
            // change of vol_id
            console.log("Change of vol ID - ignored", currentVolId, "to", vol_id);
          } else {
            api.updateLoginInfo(vol_id).then(() => {
              localStorage.setItem(VOL_ID_STORAGE_KEY, vol_id);
              localStorage.setItem(UID_STORAGE_KEY, user.uid);
            });
          }
        }
        setVolunteerId(vol_id);
      } else {
        // normal login
        if (currentVolId && currentVolId.length > 0) {
          setVolunteerId(currentVolId);
          if (currentUid === user.uid) {
            // Do nothing
          } else {
            api.updateLoginInfo(currentVolId).then(() => {
              localStorage.setItem(UID_STORAGE_KEY, user.uid);
            });
          }
        }
      }
    }
  }

  useEffect(() => {
    api.init(onAuth);
  }, []);





  return (
    <div className="App">
      <h2> Born to Win</h2>
      {user ? <div>Loged in: {user.uid}</div> : <div>not logged in</div>}
      {volunteerId ? <div>VolunteerID: {volunteerId}</div> : <div>not registered as a volunteer yet</div>}
    </div>
  );
}

export default App;
