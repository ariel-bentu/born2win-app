// Import PrimeReact CSS (usually in your main index.tsx or App.tsx)
import 'primereact/resources/themes/saga-blue/theme.css';  // Choose a theme
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';  // For grid and flex utilities

import './families-mgmt.css'
import { AppServices, City, Contact, FamilyCompact, UserInfo } from './types';
import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { MultiSelect } from 'primereact/multiselect';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { InputNumber } from 'primereact/inputnumber';
import { deleteContact, getFamilyContacts, handleSearchFamilies, upsertContact } from './api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { openWhatsApp } from './notification-actions';
import { InProgress } from './common-ui';
import dayjs from 'dayjs';




const roles = [
    'חולה',
    'איש קשר לוגיסטי',
    'איש קשר לשלב הסינון',
    'מגיש הטופס',
];

const genders = ['אישה', 'גבר', 'אחר'];

const relations = [
    'אם',
    'אב',
    'אח/אחות',
    'בן/בת',
    'דוד/דודה',
    'סב/סבתא',
    'חברים',
    'בן / בת זוג',
];

/** FamilyList 
 * ***********
*/

interface FamilyListProps {
    userInfo: UserInfo;
    selectedFamily: FamilyCompact | null;
    onSelectFamily: (family: FamilyCompact | null) => void;
}

const FamilyList: React.FC<FamilyListProps> = ({ selectedFamily, onSelectFamily, userInfo }) => {
    const [filteredFamilies, setFilteredFamilies] = useState<any[]>([]);
    const [shownFamily, setShownFamily] = useState<string | FamilyCompact | null>(selectedFamily);

    return <div dir="rtl" className="flex-auto m-2">
        <h3>משפחה</h3>
        <AutoComplete
            id="family"
            inputClassName="w-17rem md:w-20rem flex flex-row flex-wrap"
            placeholder={!selectedFamily ? "חיפוש לפי שם משפחה" : undefined}
            delay={500}
            value={shownFamily}
            field="name"
            optionGroupLabel="districtName"
            optionGroupChildren="families"
            suggestions={filteredFamilies}
            completeMethod={async (event: AutoCompleteCompleteEvent) => {
                const newFilter = await handleSearchFamilies(userInfo, event.query);
                setFilteredFamilies(newFilter);
            }}
            onChange={(e) => {
                setShownFamily(e.value);
                if (e.value?.name) {
                    console.log("search family", e.value);
                    onSelectFamily(e.value)
                } else {
                    onSelectFamily(null);
                }

            }} />
    </div>
};

/** ContactList 
 * ***********
*/
interface ContactListProps {
    family: any;
    appServices: AppServices;
    reload: number;
    setReload: any;
    setInProgress: (inprog: boolean) => void
}

const ContactList: React.FC<ContactListProps> = ({ family, appServices, reload, setReload, setInProgress }) => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [openForm, setOpenForm] = useState<boolean>(false);
    const [currentContact, setCurrentContact] = useState<Contact | null>(null);

    useEffect(() => {
        setInProgress(true)
        getFamilyContacts(family.id).then(setContacts)
            .finally(() => setInProgress(false));
    }, [family, reload]);

    const handleAddContact = () => {
        setCurrentContact(null);
        setOpenForm(true);
    };

    const handleEditContact = (contact: Contact) => {
        setCurrentContact(contact);
        setOpenForm(true);
    };

    const handleFormClose = (shouldReload: boolean) => {
        setOpenForm(false);
        if (shouldReload) {
            setReload((prev: number) => prev + 1);
        }
        // Refresh contacts list after adding/editing
    };

    return (
        <div dir="rtl" className='m-2'>
            <div className='flex flex-row justify-content-between'>
                <h3>אנשי קשר למשפחה: {family.familyLastName}</h3>
                <Button label="הוסף איש קשר" icon="pi pi-plus" onClick={handleAddContact} className="p-mb-2" />
            </div>
            <DataTable value={contacts} className="p-datatable-gridlines" dir='rtl'>
                <Column field="firstName" header="שם פרטי" />
                <Column field="lastName" header="שם משפחה" />
                <Column field="role" header="תפקיד" />
                <Column field="email" header="Email" />
                <Column field="phone" header="טלפון" />
                <Column
                    header="פעולות"
                    body={(rowData) => (
                        <div>
                            <Button
                                icon="pi pi-whatsapp"
                                className="p-button-text"
                                onClick={() => {
                                    if (rowData.phone) {
                                        openWhatsApp(
                                            rowData.phone,
                                            ""
                                        );
                                    }
                                }}
                                aria-label="WhatsApp"
                            />
                            <Button
                                icon="pi pi-pencil"
                                className="p-button-text p-mr-2"
                                onClick={() => handleEditContact(rowData)}
                            />
                            <Button
                                icon="pi pi-trash"
                                className="p-button-text"
                                onClick={() => deleteContact(rowData.id, family.id)
                                    .then(() => appServices.showMessage("success", "נמחק בהצלחה", ""))
                                    .catch(err => appServices.showMessage("error", "מחיקה נכשלה", err.message))
                                }
                            />
                        </div>
                    )}
                />
            </DataTable>
            <Dialog

                header={currentContact ? 'עריכת איש קשר' : 'הוספת איש קשר'}
                visible={openForm}
                style={{ width: '50vw', direction: "rtl" }}
                onHide={() => handleFormClose(false)}
            >
                <ContactForm
                    contact={currentContact}
                    appServices={appServices}
                    onClose={handleFormClose}
                    familyId={family.id}
                    setInProgress={setInProgress}
                />
            </Dialog>
        </div>
    );
};

interface ContactsManagerProps {
    userInfo: UserInfo;
    appServices: AppServices;
}

const ContactsManager = ({ userInfo, appServices }: ContactsManagerProps) => {
    const [selectedFamily, setSelectedFamily] = useState<FamilyCompact | null>(null);
    const [inProgress, setInProgress] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);

    return (
        <div className="p-grid">
            {inProgress && <InProgress />}
            <div className="p-col-12 p-md-4">
                <FamilyList
                    userInfo={userInfo}
                    selectedFamily={selectedFamily}
                    onSelectFamily={setSelectedFamily}
                />
            </div>
            <div className="p-col-12 p-md-8">
                {selectedFamily && (
                    <ContactList family={selectedFamily} appServices={appServices} reload={reload} setReload={setReload} setInProgress={setInProgress} />
                )}
            </div>
        </div>
    );
};

export default ContactsManager;

export interface ContactFormProps {
    contact: Contact | null;
    appServices: AppServices;
    onClose: (reload: boolean) => void;
    familyId: string;
    setInProgress: (inprog: boolean) => void;
}
const ContactForm: React.FC<ContactFormProps> = ({ contact, onClose, appServices, familyId, setInProgress }) => {
    const [phoneInvalid, setPhoneInvalid] = useState<boolean | undefined>();
    const [formData, setFormData] = useState<Contact>(
        contact || {
            id: '',
            firstName: '',
            lastName: '',
            role: [],
            email: '',
            phone: '',
            age: 0,
            gender: '',
            dateOfBirth: "",
            idNumber: '',
            manychatId: '',
            relationToPatient: '',
        }
    );

    const handleChange = (e: any, fieldName: string) => {
        const value = e.target ? e.target.value : e.value;
        setFormData((prev) => ({ ...prev, [fieldName]: value }));
    };

    const validatePhone = (e: any) => {
        const value = e.target && e.target.value || e.value || e;
        if (!value) return false;
        if (!value.startsWith("05")) return false;
        if (value.length !== 10) return false;
        for (let c = 0; c < value.length; c++) {
            if (isNaN(value[c])) return false
        }
        return true;
    };

    const handleSubmit = async (contact: Contact, familyId: string) => {
        if (!validatePhone(contact.phone)) {
            appServices.showMessage("error", "טלפון אינו תקין", "");
            return;
        }
        if (contact.firstName.length == 0 || contact.lastName.length == 0) {
            appServices.showMessage("error", "חובה למלא שם", "");
            return;
        }

        setInProgress(true);
        upsertContact(contact, familyId)
            .then(() => {
                appServices.showMessage("success", "נשמר בהצלחה", "");
                onClose(true);
            })
            .catch((err) => appServices.showMessage("error", "שמירה נכשלה", err.message))
            .finally(() => setInProgress(false));
    };

    return (
        <div dir="rtl" className="p-fluid contact-edit">
            <div className="p-grid">
                {/* First Name */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="firstName">שם פרטי</label>
                    <InputText
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => handleChange(e, 'firstName')}
                    />
                </div>
                {/* Last Name */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="lastName">שם משפחה</label>
                    <InputText
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => handleChange(e, 'lastName')}
                    />
                </div>
                {/* Role */}
                <div className="p-field p-col-12">
                    <label htmlFor="role">תפקיד</label>
                    <MultiSelect
                        id="role"
                        value={formData.role}
                        options={roles.map((r) => ({ label: r, value: r }))}
                        onChange={(e) => handleChange(e, 'role')}
                        placeholder="בחר תפקיד"
                        display="chip"
                    />
                </div>
                {/* Email */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="email">Email</label>
                    <InputText

                        id="email"
                        value={formData.email}
                        onChange={(e) => handleChange(e, 'email')}
                    />
                </div>
                {/* Phone */}
                <div className="p-field p-col-12 p-md-6 w-8 mt-2">
                    <label htmlFor="phone">טלפון</label>
                    <InputText
                        invalid={phoneInvalid}
                        dir='ltr'
                        id="phone"
                        keyfilter="pint"
                        inputMode="numeric"
                        value={formData.phone}
                        onChange={(e) => {
                            if (validatePhone(e)) {
                                setPhoneInvalid(false)
                            } else {
                                setPhoneInvalid(true)
                            }
                            handleChange(e, 'phone')
                        }}
                    />
                </div>
                {/* Cities
                <div className="p-field p-col-12">
                    <label htmlFor="cities">ערים</label>
                    <MultiSelect
                        id="cities"
                        value={formData.cities.map((city) => city.id)}
                        options={allCities.map((city) => ({ label: city.name, value: city.id }))}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                cities: (e.value as string[]).map((id) =>
                                    allCities.find((city) => city.id === id)!
                                ),
                            }))
                        }
                        placeholder="בחר ערים"
                        display="chip"
                    />
                </div> */}
                {/* Age */}
                <div className="p-field w-2 p-md-6">
                    <label htmlFor="age">גיל</label>
                    <InputNumber
                        className='m-2'
                        dir='ltr'
                        min={5}
                        max={120}
                        id="age"
                        value={formData.age}
                        onValueChange={(e) => handleChange(e, 'age')}
                        useGrouping={false}
                    />
                </div>
                {/* Gender */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="gender">מגדר</label>
                    <Dropdown
                        id="gender"
                        value={formData.gender}
                        options={genders.map((g) => ({ label: g, value: g }))}
                        onChange={(e) => handleChange(e, 'gender')}
                        placeholder="בחר מגדר"
                    />
                </div>
                {/* Date of Birth */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="dateOfBirth">תאריך לידה</label>
                    <Calendar
                        selectionMode="single"
                        yearNavigator={true}
                        monthNavigator={true}
                        yearRange={"1940:"+dayjs().year()}
                        onMonthChange={(e)=>formData.dateOfBirth = `01/${e.month}/${e.year}`}
                        id="dateOfBirth"
                        value={new Date(formData.dateOfBirth)}
                        onChange={(e) => handleChange(e, 'dateOfBirth')}
                        dateFormat="dd/mm/yy"
                        showIcon
                    />
                </div>
                {/* ID Number */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="idNumber">תעודת זהות</label>
                    <InputText
                        id="idNumber"
                        value={formData.idNumber}
                        onChange={(e) => handleChange(e, 'idNumber')}
                    />
                </div>
                {/* Relation to Patient */}
                <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="relationToPatient">סוג הקשר לחולה</label>
                    <Dropdown
                        id="relationToPatient"
                        value={formData.relationToPatient}
                        options={relations.map((r) => ({ label: r, value: r }))}
                        onChange={(e) => handleChange(e, 'relationToPatient')}
                        placeholder="בחר סוג קשר"
                    />
                </div>
                {/* Manychat ID */}
                {contact && <div className="p-field p-col-12 p-md-6">
                    <label htmlFor="manychatId">manychat_id</label>
                    <InputText
                        readOnly={true}
                        id="manychatId"
                        value={formData.manychatId}
                        onChange={(e) => handleChange(e, 'manychatId')}
                    />
                </div>}
                {/* Submit and Cancel Buttons */}
                <div className="p-field p-col-12">
                    <Button
                        label={contact ? 'עדכן' : 'הוסף'}
                        icon="pi pi-check"
                        onClick={() => handleSubmit(formData, familyId)}
                        className="p-mr-2"
                    />
                    <Button
                        label="ביטול"
                        icon="pi pi-times"
                        className="p-button-secondary"
                        onClick={() => onClose(false)}
                    />
                </div>
            </div>
        </div>
    );
};