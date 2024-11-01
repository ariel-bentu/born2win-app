import React, { useEffect, useState } from 'react';
import { DataTable, DataTableRowGroupHeaderTemplateOptions } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { deleteHoliday, getRegisteredHolidays, handleSearchFamilies, upsertHoliday } from './api';
import { AppServices, FamilyCompact, Holiday, IdName, UserInfo } from './types';
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
            addAvailability: false,
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
                let ret = sortByStringField(a,b, "district");
                if (ret != 0) return ret;

                // same district
                ret = sortByStringField(a,b, "familyName");
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
    const formatData = (date:string | undefined) => {
        if (!date) return "";
        const d = dayjs(date);
        if (today.year() != d.year()) return d.format("DD/MM/YY")
        return  d.format("DD/MM");
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
            value={registeredHolidays?.filter(rh=> selectedDistricts.length == 0 || selectedDistricts.some(sd=>sd == rh.district) )}
            style={{ textAlign: 'right' }}
            rowGroupMode="subheader"
            groupRowsBy={'district'}
            rowGroupHeaderTemplate={rowGroupHeaderTemplate}
        >
            <Column body={(h: Holiday) => formatData(h.date)}  header="תאריך" style={{ textAlign: 'right' }} />
            <Column body={(rowData: Holiday) => {
                if (!rowData.familyId) return Modes.array[Modes.Holiday - 1].name;
                if (rowData.addAvailability) return Modes.array[Modes.Add - 1].name;
                return Modes.array[Modes.Block - 1].name;
            }} header="סוג" style={{ textAlign: 'right' }} />
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
                            addAvailability: false,
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
                                    addAvailability: false,
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

const Modes = {
    Add: 2,
    Block: 3,
    Holiday: 1,
    array: [
        { name: 'חג', value: 1 },
        { name: 'הוספת תאריך למשפחה', value: 2 },
        { name: 'חסימת תאריך למשפחה', value: 3 },
    ]
}

function EditHoliday({ holiday, visible, userInfo, onCancel, onSave, appServices }: EditHolidayProps) {
    const [name, setName] = useState<string>(holiday.name);
    const [mode, setMode] = useState(holiday.familyId ? (holiday.addAvailability ? Modes.Add : Modes.Block) : Modes.Holiday);
    const [alternateDate, setAlternateDate] = useState<string | undefined>(holiday.alternateDate);
    const [date, setDate] = useState<string>(holiday.date);
    const [family, setFamily] = useState<IdName | undefined>(holiday.familyId && holiday.familyName ? ({
        id: holiday.familyId,
        name: holiday.familyName
    }) : undefined);
    const [filteredFamilies, setFilteredFamilies] = useState<any[]>([]);
    console.log("Holiday in edit", holiday, name, family)
    return <Dialog style={{ direction: "rtl" }} visible={visible} onHide={onCancel} header="עריכת חג/יום חריג" >
        <div className="flex flex-row justify-content-start">
            <SelectButton
                pt={{ root: { className: "select-button-container" } }}
                unstyled
                value={mode} onChange={(e) => setMode(e.value)} optionLabel="name" options={Modes.array}
                itemTemplate={(option) => (
                    <div className={`select-button-item ${mode === option.value ? 'p-highlight' : ''}`}>
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
            <label htmlFor="date" className="font-bold block mt-5 mb-2">תאריך
            </label>
            <Calendar
                locale="he"
                id="date" value={dayjs(date).toDate()}
                onChange={(e) => setDate(dayjs(e.value).format(DATE_AT))} showIcon />
        </div>

        {mode != Modes.Holiday &&
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


        {(mode == Modes.Holiday || mode == Modes.Block) &&
            <div className="flex-auto">
                <label htmlFor="altDate" className="font-bold block mt-5 mb-2">
                    {`תאריך אלטרנטיבי ${mode == Modes.Block ? "(לא חובה)" : ""}`}
                </label>
                <Calendar
                    locale="he"
                    id="altDate" value={alternateDate ? dayjs(alternateDate).toDate() : undefined}
                    onChange={(e) => setAlternateDate(dayjs(e.value).format(DATE_AT))} showIcon />
            </div>
        }

        <div className='mt-5'>
            <Button label='שמירה' onClick={() => {
                if (name.length == 0) {
                    appServices.showMessage("error", "חסר תיאור", "יש להוסיף תיאור");
                    return;
                }

                if (date.length == 0) {
                    appServices.showMessage("error", "חסר תאריך", "יש לבחור תאריך");
                    return;
                }

                const holidayToSave = {
                    id: holiday.id,
                    name,
                    date,
                } as Holiday;
                if (mode != Modes.Holiday) {
                    if (!family) {
                        appServices.showMessage("error", "חסר משפחה", "יש לבחור משפחה");
                        return;
                    }
                    holidayToSave.alternateDate = mode == Modes.Block && alternateDate != "" ? alternateDate : undefined;
                    holidayToSave.familyId = family.id;
                } else if (alternateDate != "") {
                    holidayToSave.alternateDate = alternateDate;
                }
                onSave(holidayToSave);

            }}></Button>
            <Button label='ביטול' onClick={onCancel}></Button>
        </div>

    </Dialog >
}


export default HolidaysAdmin;