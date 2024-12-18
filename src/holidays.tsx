import React, { useEffect, useState } from 'react';
import { DataTable, DataTableRowGroupHeaderTemplateOptions } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { deleteHoliday, getRegisteredHolidays, handleSearchFamilies, upsertHoliday } from './api';
import { AppServices, EventType, FamilyCompact, Holiday, IdName, UserInfo } from './types';
import './holidays.css'

import { CalOptions, HebrewCalendar } from '@hebcal/core'
import { DATE_AT, sortByDate, sortByStringField } from './utils';
import dayjs, { Dayjs } from 'dayjs';
import { Button } from 'primereact/button';
import { InProgress, WeekSelectorSlider } from './common-ui';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { SelectButton } from 'primereact/selectbutton';
import { Calendar } from 'primereact/calendar';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { confirmPopup } from 'primereact/confirmpopup';
import { MultiSelect } from 'primereact/multiselect';
import { SelectItem } from 'primereact/selectitem';
import { Dropdown } from 'primereact/dropdown';
export const getPotentialHolidays = ({ from, to }: { from: Dayjs, to: Dayjs }): Holiday[] => {
    const options: CalOptions = {
        start: from.toDate(),
        end: to.toDate(),
        isHebrewYear: false,
        candlelighting: false,
        sedrot: false,
        omer: false,
        noRoshChodesh: true,
    };

    const events = HebrewCalendar.calendar(options);
    const holidays: Holiday[] = events.map((ev) => {
        const hd = ev.getDate();
        const date = hd.greg(); // Convert to Gregorian date
        return {
            id: dayjs(date).format(DATE_AT),
            name: ev.render('he'),
            date: dayjs(date).format(DATE_AT),
            type: EventType.Holiday,
        };
    });

    return holidays;
};

interface HolidaysAdminProps {
    userInfo: UserInfo;
    appServices: AppServices;
    topPosition: number;
}

const noDistrict = { label: "חגים", value: null };

export const HolidaysAdmin = ({ userInfo, appServices }: HolidaysAdminProps) => {
    const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
    const [registeredHolidays, setRegisteredHolidays] = useState<Holiday[] | undefined>();
    const [potentialHolidays, setPotentialHolidays] = useState<Holiday[]>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<[number, number]>([-1, 6]);
    const [reload, setReload] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);

    const listOfDistricts = [noDistrict, ...(userInfo?.districts?.map(d => ({ label: d.name, value: d.id })) || [])];


    const [editingHoliday, setEditingHoliday] = useState<Holiday | undefined>();

    const getRange = (dates: [number, number]) => {

        const [from, to] = dates.map(d => dayjs().add(d, "week")) as [Dayjs, Dayjs];
        return { from, to };

    }

    useEffect(() => {
        if (registeredHolidays) {
            const potentials = getPotentialHolidays(getRange(selectedWeeks)).filter(ph => !registeredHolidays.some(rh => !rh.familyId && rh.date == ph.date));
            setPotentialHolidays(potentials);
        }
    }, [registeredHolidays, reload]);


    useEffect(() => {
        const { from, to } = getRange(selectedWeeks);
        setLoading(true);
        getRegisteredHolidays(from.format(DATE_AT), to.format(DATE_AT)).then(list => {
            // sort by district, then family name then date
            list.sort((a, b) => {
                let ret = sortByStringField(a, b, "district");
                if (ret != 0) return ret;

                // same district
                ret = sortByStringField(a, b, "familyName");
                if (ret != 0) return ret;

                return sortByDate(a.date, b.date);
            });
            setRegisteredHolidays(list);
        }).finally(() => setLoading(false));
    }, [selectedWeeks, reload]);

    const handleDeleteHoliday = (event: React.SyntheticEvent, holiday: Holiday) => {
        confirmPopup({
            target: event.currentTarget as any,
            message: `'${holiday.name}' האם למחוק את ?`,
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: "כן",
            rejectLabel: "לא",
            accept: async () => {
                deleteHoliday(holiday.id)
                    .then(() => {
                        appServices.showMessage("success", "נמחק בהצלחה", "")
                        setReload(prev => prev + 1);
                    })
                    .catch(err => appServices.showMessage("error", "מחיקה נכשלה", err.message));
            }
        });

    }

    const rowGroupHeaderTemplate = (data: Holiday) => {
        const { district } = data;
        const name = district && userInfo.districts?.find(d => d.id == district)?.name;
        return (
            <tr style={{ display: "flex" }}>
                <td colSpan={6}>
                    {!!district ? <strong>{`מחוז: ${name}`}</strong> : <strong>חגים</strong>}
                </td>
            </tr>
        );
    };

    const today = dayjs()
    const formatData = (date: string | undefined) => {
        if (!date) return "";
        const d = dayjs(date);
        if (today.year() != d.year()) return d.format("DD/MM/YY")
        return d.format("DD/MM");
    }

    return (<div>
        {editingHoliday && <EditHoliday userInfo={userInfo}
            appServices={appServices}
            holiday={editingHoliday}
            visible={editingHoliday != undefined}
            onCancel={() => setEditingHoliday(undefined)}
            onSave={(holiday) => {
                setLoading(true);
                upsertHoliday(holiday)
                    .then(() => {
                        appServices.showMessage("success", "יום חג/חריג נשמר בהצלחה", "")
                        setReload(prev => prev + 1);
                        setEditingHoliday(undefined);
                    })
                    .catch(err => appServices.showMessage("error", "שמירה נכשלה", err.message))
                    .finally(() => setLoading(false))
            }} />}
        <div className='flex flex-row  justify-content-center align-items-start' style={{ height: 75 }}>
            <WeekSelectorSlider min={-1} max={8} setSelectedWeeks={setSelectedWeeks} selectedWeeks={selectedWeeks} />
        </div>
        {loading && <InProgress />}

        <MultiSelect
            value={selectedDistricts}
            options={listOfDistricts}
            onChange={e => setSelectedDistricts(e.value)}
            placeholder="בחר מחוזות"
            display="chip"
            className="w-full md:w-20rem mt-3"
        />

        <div className='holiday-table-title'>חגים וחריגים רשומים</div>
        <DataTable
            dir='rtl'
            value={registeredHolidays?.filter(rh => selectedDistricts.length == 0 || selectedDistricts.some(sd => sd == rh.district))}
            style={{ textAlign: 'right' }}
            rowGroupMode="subheader"
            groupRowsBy={'district'}
            rowGroupHeaderTemplate={rowGroupHeaderTemplate}
        >
            <Column body={(h: Holiday) => formatData(h.date)} header="תאריך" style={{ textAlign: 'right' }} />
            <Column field="type" header="סוג" style={{ textAlign: 'right' }} />
            <Column field="name" header="תיאור" style={{ textAlign: 'right' }} />
            <Column field="familyName" header="משפחה" style={{ textAlign: 'right' }} />
            <Column body={(h: Holiday) => formatData(h.alternateDate)} header="תאריך חלופי" style={{ textAlign: 'right' }} />
            <Column headerStyle={{ display: "flex", justifyContent: "flex-end" }}
                header={() => (<Button
                    icon="pi pi-plus"
                    onClick={() => {
                        setEditingHoliday({
                            id: "",
                            date: "",
                            name: "",
                            type: EventType.Block,
                        });
                    }}
                />)}
                body={(rowData) => (
                    <>
                        <Button
                            icon="pi pi-pencil"
                            onClick={() => {
                                setEditingHoliday(rowData as Holiday);
                            }}
                        />
                        <Button
                            icon="pi pi-trash"
                            onClick={(e) => handleDeleteHoliday(e, rowData)}
                        />
                    </>
                )}
            />
        </DataTable>

        {/* Potential Holidays Table */}
        <div className='holiday-table-title mt-5'>חגי ישראל</div>
        <DataTable value={potentialHolidays}>
            <Column field="date" header="תאריך" style={{ textAlign: 'right' }} />
            <Column field="name" header="תיאור" style={{ textAlign: 'right' }} />
            <Column
                body={(rowData: any) => (
                    <>
                        {rowData.isRegistered ? (
                            <i>Already Registered</i>
                        ) : (
                            <Button
                                icon="pi pi-plus"
                                onClick={() => setEditingHoliday({
                                    id: "",
                                    name: rowData.name,
                                    date: rowData.date,
                                    type: EventType.Holiday,
                                })}
                            />
                        )}
                    </>
                )}
            />
        </DataTable>
    </div>
    );
};

interface EditHolidayProps {
    userInfo: UserInfo;
    appServices: AppServices;
    visible: boolean;
    holiday: Holiday;
    onSave: (holiday: Holiday) => void;
    onCancel: () => void;
}

const typeArray = [
    { name: 'חג', value: EventType.Holiday },
    // { name: 'הוספת תאריך למשפחה', value: EventType.Add },
    { name: 'חסימת תאריך למשפחה', value: EventType.Block },
    { name: 'פינוקי חג', value: EventType.HolidayTreats },
];


function EditHoliday({ holiday, visible, userInfo, onCancel, onSave, appServices }: EditHolidayProps) {
    const [name, setName] = useState<string>(holiday.name);
    const [type, setType] = useState<EventType>(holiday.type);
    const [alternateDate, setAlternateDate] = useState<string | undefined>(holiday.alternateDate);
    const [date, setDate] = useState<string>(holiday.date);
    const [family, setFamily] = useState<IdName | undefined>(holiday.familyId && holiday.familyName ? ({
        id: holiday.familyId,
        name: holiday.familyName
    }) : undefined);
    const [district, setDistrict] = useState<string | undefined>(holiday.district);

    const [filteredFamilies, setFilteredFamilies] = useState<any[]>([]);
    console.log("Holiday in edit", holiday, name, family)


    let labelDate = "";
    let labelAlternativeDate = "";
    let alternativeMandatory = false;
    let alternativeVisible = false;
    switch (type) {
        case EventType.Holiday:
            labelDate = "תאריך החג לחסום";
            labelAlternativeDate = "עד תאריך (אם ריק אז רק יום אחד)"
            alternativeVisible = true;
            break;
        case EventType.Block:
            labelDate = "תאריך לחסום";
            labelAlternativeDate = "עד תאריך (אם ריק אז רק יום אחד)"
            alternativeVisible = true;
            break;
        case EventType.Add:
            labelDate = "תאריך להוסיף";
            break;
        case EventType.HolidayTreats:
            labelDate = "מתאריך";
            labelAlternativeDate = "עד תאריך";
            alternativeMandatory = true;
            alternativeVisible = true;
            break;
    }


    return <Dialog style={{ direction: "rtl" }} visible={visible} onHide={onCancel} header="עריכת חג/יום חריג" >
        <div className="flex flex-row justify-content-start">
            <SelectButton
                pt={{ root: { className: "select-button-container" } }}
                unstyled
                value={type} onChange={(e) => setType(e.value)} optionLabel="name" options={typeArray}
                itemTemplate={(option) => (
                    <div className={`select-button-item ${type === option.value ? 'p-highlight' : ''}`}>
                        {option.name}
                    </div>
                )}
            />
        </div>
        <div className="flex-auto">
            <label htmlFor="desc" className="font-bold block mt-5 mb-2">תיאור
            </label>

            <InputText id="desc" placeholder='תיאור' className='w-12' value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex-auto">
            <label htmlFor="date" className="font-bold block mt-5 mb-2">
                {labelDate}
            </label>
            <Calendar
                maxDate={dayjs().add(3, "month").toDate()}
                locale="he"
                id="date" value={dayjs(date).toDate()}
                onChange={(e) => setDate(dayjs(e.value).format(DATE_AT))} showIcon />
        </div>

        {type != EventType.Holiday && type != EventType.HolidayTreats &&
            <div className="flex-auto">
                <label htmlFor="family" className="font-bold block mt-5 mb-2">משפחה
                </label>
                <AutoComplete
                    id="family"
                    inputClassName="w-17rem md:w-20rem flex flex-row flex-wrap"
                    placeholder={!family ? "חיפוש לפי שם משפחה" : undefined}
                    delay={500}
                    value={family}
                    field="name"
                    optionGroupLabel="districtName"
                    optionGroupChildren="families"
                    suggestions={filteredFamilies}
                    completeMethod={async (event: AutoCompleteCompleteEvent) => {
                        const newFilter = await handleSearchFamilies(userInfo, event.query);
                        setFilteredFamilies(newFilter);
                    }}
                    onChange={(e) => setFamily(e.value)} />
            </div>
        }

        {type == EventType.HolidayTreats && <div className="flex flex-column p-2 align-items-start">
            <label htmlFor="family" className="font-bold block mt-5 mb-2">מחוז (השאירו ריק לכל המחוזות)
            </label>
            <Dropdown
                value={district}
                options={userInfo?.districts?.map(d => ({ label: d.name, value: d.id })) || []}
                onChange={(e) => setDistrict(e.value)}
                placeholder="בחר מחוז"
                className="w-18rem md:w-20rem mt-3"
            />
        </div>}


        {alternativeVisible &&
            <div className="flex-auto">
                <label htmlFor="altDate" className="font-bold block mt-5 mb-2">
                    {labelAlternativeDate}
                </label>
                <Calendar
                    maxDate={dayjs().add(3, "month").toDate()}
                    locale="he"
                    id="altDate" value={alternateDate ? dayjs(alternateDate).toDate() : undefined}
                    onChange={(e) => setAlternateDate(dayjs(e.value).format(DATE_AT))} showIcon />
            </div>
        }

        <div className='mt-5'>
            <Button label='שמירה' onClick={() => {

                const isValid = (d: string | undefined) => {
                    return d && d.length > 0 && !d.includes("Invalid");
                }

                if (name.length == 0) {
                    appServices.showMessage("error", "חסר תיאור", "יש להוסיף תיאור");
                    return;
                }

                if (!isValid(date)) {
                    appServices.showMessage("error", "חסר תאריך", "יש לבחור תאריך");
                    return;
                }

                const holidayToSave = {
                    id: holiday.id,
                    name,
                    date,
                    type,
                } as Holiday;

                if (type != EventType.Holiday && type != EventType.HolidayTreats) {
                    if (!family) {
                        appServices.showMessage("error", "חסר משפחה", "יש לבחור משפחה");
                        return;
                    }
                }
                if (family) {
                    holidayToSave.familyId = family.id;
                }

                if (district) {
                    holidayToSave.district = district;
                }


                holidayToSave.alternateDate = alternativeVisible ? alternateDate : undefined;
                if (!isValid(holidayToSave.alternateDate)) {
                    holidayToSave.alternateDate = undefined;
                }

                if (holidayToSave.alternateDate && dayjs(holidayToSave.alternateDate).isBefore(date, "day")) {
                    appServices.showMessage("error", "תאריך סיום לא חוקי", "יש לבחור תאריך סיום מאוחר מתאריך התחלה");
                    return;
                }

                if (alternativeMandatory && !holidayToSave.alternateDate) {
                    appServices.showMessage("error", "חסר תאריך סיום", "יש לבחור תאריך סיום");
                    return;
                }

                if (type == EventType.HolidayTreats && !dayjs(holidayToSave.alternateDate).isSame(date, "week")) {
                    appServices.showMessage("error", "תאריך סיום לא חוקי", "פינוקי חג לא יכולים להתפרס על תאריכים משבועות שונים");
                    return;
                }

                onSave(holidayToSave);

            }}></Button>
            <Button label='ביטול' onClick={onCancel}></Button>
        </div>

    </Dialog >
}


export default HolidaysAdmin;