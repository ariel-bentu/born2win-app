import { AutoComplete, AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { useState } from "react";
import { isNotEmpty } from "./utils";
import { ShowToast, UserInfo } from "./types";
import { Button } from "primereact/button";
import { generateInstallationLinkForUser, handleSearchUsers } from "./api";
import { InProgress } from "./common-ui";

interface ImpersonateProps {
    userInfo: UserInfo | null;
    onChange: (userId: string | undefined, name?: string) => void;
    showToast: ShowToast;
}

export default function Impersonate({ userInfo, onChange, showToast }: ImpersonateProps) {
    const [selectedUser, setSelectedUser] = useState<any | undefined>();
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

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
            <Button label="בטל פעולה בשם" onClick={() => onChange(undefined)} />
            <Button disabled={!selectedUser} label="העתק לינק להתקנה" onClick={async () => {
                setLoading(true);
                const link = await generateInstallationLinkForUser(selectedUser.id)
                    .catch(err => showToast("error", "יצירת לינק נכשלה", err.message))
                    .finally(() => setLoading(false));
                if (link) {
                    navigator.clipboard.writeText(link);
                    showToast("success", "לינק הועתק ללוח - ניתק כעת להדביקו", "");
                }
            }} />
        </div>
    </div>
}