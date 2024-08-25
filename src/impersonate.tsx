import { AutoComplete, AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { useState } from "react";
import { isNotEmpty } from "./utils";
import { UserInfo } from "./types";
import { Button } from "primereact/button";
import { handleSearchUsers } from "./api";

interface ImpersonateProps {
    userInfo: UserInfo | null;
    onChange:(userId: string | undefined, name?:string)=>void;
}

export default function Impersonate({ userInfo, onChange }: ImpersonateProps) {
    const [selectedUser, setSelectedUser] = useState<any | undefined>();
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]);

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
        <Button disabled={!selectedUser} label="שנה למשתמש" onClick={() => onChange(selectedUser.id, selectedUser.name)} />
        <Button label="ביטול" onClick={() =>  onChange(undefined)} />
    </div>
}