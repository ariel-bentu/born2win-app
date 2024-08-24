import React, { useCallback, useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { MultiSelect } from 'primereact/multiselect';
import { Recipient, ShowToast, UserInfo } from './types';
import { handleSearchUsers, searchUsers, sendMessage } from './api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { getByDisplayValue } from '@testing-library/react';
import { Toast } from 'primereact/toast';
import { InProgress } from './common-ui';

interface SendMessageProps {
    userInfo: UserInfo,
    showToast: ShowToast,
}

export const SendMessage: React.FC<SendMessageProps> = ({ userInfo, showToast }) => {
    const [title, setTitle] = useState<string>('');
    const [body, setBody] = useState<string>('');
    const [recipients, setRecipients] = useState<Recipient[] | undefined>();
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
    const [inProgress, setInProgress] = useState<boolean>(false);


    const handleSend = useCallback(() => {
        setInProgress(true)
        sendMessage(selectedDistricts, recipients, title, body || "").then(() => showToast("success", "נשלח", ""))
            .catch((err) => showToast("error", "שליחה נכשלה", err.message))
            .finally(() => setInProgress(false));
    }, [title, body, recipients]);

    const handleClear = ()=> {
        setTitle('');
        setBody('');
        setRecipients(undefined);
        setSelectedDistricts([]);
    }

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    // const handleSearchUsers = async (event: AutoCompleteCompleteEvent) => {

    //     // Timeout to emulate a network connection
    //     console.log("query", event.query)
    //     const recipients = await searchUsers(event.query);
    //     const districts = new Map();
    //     recipients.forEach(r => {
    //         let userMahuz = r.mahoz || "";

    //         let mahoz = districts.get(userMahuz);
    //         if (!mahoz) {
    //             mahoz = {
    //                 districtName: userInfo.districts?.find(d => d.id == userMahuz)?.name || "אחר",
    //                 id: userMahuz,
    //                 users: [],
    //             }
    //             districts.set(userMahuz, mahoz);
    //         }

    //         mahoz.users.push({
    //             name: r.name,
    //             id: r.id
    //         });
    //     });



    //     setFilteredUsers(Array.from(districts.values()));
    // }

    return (
        <div className="card">

            <div className="flex flex-row p-2 align-items-center">
                <div className="w-3rem">מחוז</div>
                <MultiSelect
                    value={selectedDistricts}
                    options={userInfo?.districts?.map(d => ({ label: d.name, value: d.id })) || []}
                    onChange={handleDistrictChange}
                    placeholder="(אף מחוז) בחר מחוזות"
                    display="chip"
                    className="w-18rem md:w-20rem mt-3"
                />
            </div>
            <div className="flex flex-row p-2 align-items-center">
                <div className="w-3rem">פרטי</div>

                <AutoComplete
                    inputClassName="w-17rem md:w-20rem flex flex-row flex-wrap"
                    multiple
                    placeholder={!recipients || recipients.length < 0 ? "חיפוש לפי שם פרטי או משפחה" : undefined}
                    delay={500}
                    value={recipients}
                    field="name"
                    optionGroupLabel="districtName"
                    optionGroupChildren="users"
                    suggestions={filteredUsers}
                    completeMethod={ async (event: AutoCompleteCompleteEvent) => {
                        const newFilter = await handleSearchUsers(userInfo, event.query);
                        setFilteredUsers(newFilter);
                    }}
                    onChange={(e) => setRecipients(e.value)} />

            </div>
            <div className="p-field m-2">
                <label htmlFor="title">כותרת:</label>
                <InputText
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full"
                />
            </div>
            <div className="p-field m-2">
                <label htmlFor="body">תוכן ההודעה:</label>
                <InputTextarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    className="w-full"
                />
            </div>
            {inProgress && <InProgress/>}
            <Button label="שלח" className="m-2 ml-4" icon="pi pi-send" disabled={inProgress || !(title && (recipients || selectedDistricts.length > 0))} onClick={handleSend} />
            <Button label="נקה" className="m-2" icon="pi pi-times-circle"  onClick={handleClear} />
        </div>
    );
};