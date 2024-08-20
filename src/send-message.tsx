import React, { useCallback, useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { MultiSelect } from 'primereact/multiselect';
import { Recipient, UserInfo } from './types';
import { searchUsers, sendMessage } from './api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { getByDisplayValue } from '@testing-library/react';

interface SendMessageProps {
    userInfo: UserInfo,
}

export const SendMessage: React.FC<SendMessageProps> = ({ userInfo }) => {
    const [title, setTitle] = useState<string>('');
    const [body, setBody] = useState<string>('');
    const [recipient, setRecipient] = useState< Recipient[] | undefined>();
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);


    const handleSend = useCallback(() => {
        sendMessage(selectedDistricts, recipient, title, body);
        //     setTitle('');
        //     setBody('');
        //     setRecipient('');
        //     setRecipientType('all');
    }, [title, body, recipient]);

    const handleDistrictChange = (e: any) => {
        setSelectedDistricts(e.value);
    };

    const handleSearchUsers = async (event: AutoCompleteCompleteEvent) => {
        // Timeout to emulate a network connection
        console.log("query", event.query)
        const recipients = await searchUsers(event.query);
        const districts = new Map();
        recipients.forEach(r => {
            let userMahuz = r.mahoz || "";
            
            let mahoz = districts.get(userMahuz);
            if (!mahoz) {
                mahoz = {
                    districtName: userInfo.districts?.find(d => d.id == userMahuz)?.name || "אחר",
                    id: userMahuz,
                    users: [],
                }
                districts.set(userMahuz, mahoz);
            }

            mahoz.users.push({
                name: r.name,
                id: r.id
            });
        });



        setFilteredUsers(Array.from(districts.values()));
    }

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
                    placeholder={!recipient || recipient.length < 0 ? "חיפוש לפי שם פרטי או משפחה":undefined}
                    delay={500}
                    value={recipient}
                    field="name"
                    optionGroupLabel="districtName"
                    optionGroupChildren="users"
                    suggestions={filteredUsers}
                    completeMethod={handleSearchUsers}
                    onChange={(e) => setRecipient(e.value)} />

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
            <Button label="שלח" className="m-2" disabled={!(title && body && (recipient || selectedDistricts.length > 0))} onClick={handleSend} />
        </div>
    );
};