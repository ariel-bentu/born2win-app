import { AutoComplete, AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { useState } from "react";
import { isNotEmpty } from "./utils";
import { ShowToast, UserInfo } from "./types";
import { Button } from "primereact/button";
import { generateInstallationLinkForUser, handleSearchUsers } from "./api";
import { InProgress } from "./common-ui";
import { openWhatsApp } from "./notification-actions";

interface ImpersonateProps {
    userInfo: UserInfo | null;
    onChange: (userId: string | undefined, name?: string) => void;
    showToast: ShowToast;
    isImpersonated: boolean;
}

export default function Impersonate({ userInfo, onChange, showToast, isImpersonated }: ImpersonateProps) {
    const [selectedUser, setSelectedUser] = useState<any | undefined>();
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [installLink, setInstallLink] = useState<string>("");

    if (!userInfo || !userInfo.isAdmin) return null;

    return <div dir="rtl"><AutoComplete
        inputClassName="w-17rem md:w-20rem flex flex-row flex-wrap"
        placeholder={"חיפוש שם"}
        delay={500}
        value={selectedUser}
        field="name"
        optionGroupLabel="districtName"
        optionGroupChildren="users"
        suggestions={filteredUsers}
        completeMethod={async (event: AutoCompleteCompleteEvent) => {
            const newFilter = await handleSearchUsers(userInfo, event.query);
            setFilteredUsers(newFilter);
        }}

        onChange={(e) => setSelectedUser(e.value)} />
        {loading && <InProgress />}
        <div className="flex flex-column">
            <Button disabled={!selectedUser} label={"פעל בשם" + (selectedUser ? ": " + selectedUser.name : "")} onClick={() => onChange(selectedUser.id, selectedUser.name)} />
            <Button disabled={!isImpersonated} label="בטל פעולה בשם" onClick={() => onChange(undefined)} />
            <Button disabled={!selectedUser} label="שלח לינק להתקנה" onClick={async () => {
                setLoading(true);
                const link = await generateInstallationLinkForUser(selectedUser.id)
                    .catch(err => showToast("error", "יצירת לינק נכשלה", err.message))
                    .finally(() => setLoading(false));
                if (link) {
                    setInstallLink(link);
                }
            }} />
            {installLink && <div className="flex flex-row align-items-center">
                <span>שלח בווטסאפ למשתמש</span>
                <Button
                            icon="pi pi-whatsapp"
                            className="p-button-rounded p-button-info m-2"
                            onClick={() => openWhatsApp(selectedUser.phone, "לינק להתקנה: " + installLink)}
                            aria-label="WhatsApp"
                        />
                </div>}
        </div>
    </div>
}