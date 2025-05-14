import { AutoComplete, AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Dialog } from "primereact/dialog";
import { useEffect, useState } from "react";
import { AppServices, DateInfo, DAYS, FamilyDemand, FamilyDetails, Status, UserInfo, VolunteerInfo, VolunteerType } from "./types";
import { getDemands, getVolunteerInfo, handleSearchUsers, updateFamilyDemand } from "./api";
import { Button } from "primereact/button";
import dayjs from "dayjs";
import { SelectButton } from "primereact/selectbutton";
import { DATE_AT, dateInRange } from "./utils";
import { Accordion, AccordionTab } from "primereact/accordion";
import { ProgressSpinner } from "primereact/progressspinner";
import { WhatsAppButton } from "./common-ui";


export function FamilyOpenDemandDialog({ selectedDateInfo, familyDetails, visible, onClose, userInfo, appServices, allDemands }: {
    selectedDateInfo: DateInfo | null;
    familyDetails: FamilyDetails | undefined;
    visible: boolean;
    onClose: (changed: boolean) => void;
    userInfo: UserInfo;
    appServices: AppServices;
    allDemands: FamilyDemand[];
}) {
    const [selectedCook, setSelectedCook] = useState<VolunteerInfo | null>(null);
    const [selectedCookDay, setSelectedCookDay] = useState<string | null>(null);
    const [filteredUsers, setFilteredUsers] = useState<any[]>([]); // Adjust the type as needed
    const [busy, setBusy] = useState(false);
    const [loadHistory, setLoadHistory] = useState<boolean>(false);
    const [history, setHistory] = useState<{info:VolunteerInfo, name: string, phone:string, date: string, status: string }[] | undefined>();

    useEffect(() => {
        setHistory(undefined);
        setLoadHistory(false);
        setSelectedCook(null);
        setSelectedCookDay(null);
        setFilteredUsers([]);
    }, [selectedDateInfo]);


    useEffect(() => {
        if (loadHistory && !history && selectedDateInfo) {
            setBusy(true);
            getDemands([dayjs().subtract(2, "months").format(DATE_AT), dayjs().format(DATE_AT)],
                undefined, selectedDateInfo.mainBaseFamilyId, VolunteerType.Meal, Status.Occupied).then(async (demands) => {
                    const volunteersList = demands.map(d => d.volunteerId);
                    const volunteersInfo = await getVolunteerInfo(volunteersList);
                    const from = dayjs(selectedDateInfo.date).startOf("week")
                    const to = dayjs(selectedDateInfo.date).endOf("week")


                    const history = demands.map(demand => {
                        const vol = volunteersInfo.find(v => v.id === demand.volunteerId);
                        if (!vol) return undefined;

                        // Check if available this date's week:
                        const volunteersDemand = allDemands.filter(d => d.volunteerId === demand.volunteerId && dateInRange(selectedDateInfo.date, from, to));

                        return {info:vol, name: vol.firstName + " " + vol.lastName, phone: vol.phone, date: demand.date, status: volunteersDemand.length > 0 ? "תפוס" : "פנוי" };
                    })
                    setHistory(history.filter(h => !!h));
                }).finally(() => setBusy(false));
            // setHistory([
            //     { name: "רון כהן", date: "2025-05-10", status: "פנוי" },
            //     { name: "שירה לוי", date: "2025-05-12", status: "תפוס" },
            //     { name: "דני ברק", date: "2025-05-14", status: "פנוי" }
            // ]);
        }
    }, [loadHistory, history]);

    return (
        <Dialog
            header={<div style={{ textAlign: 'right', width: '100%' }}>תאריך שאינו משובץ</div>}
            visible={visible}
            onHide={() => onClose(false)}
            style={{ position: 'absolute', right: '10%', left: '10%', top: '20%' }}
        >
            {busy && <ProgressSpinner style={{ position: 'absolute', left: '50%', top: 60, height: 20, width: 20, zIndex: 1000 }} />}
            <Accordion activeIndex={-1} dir="rtl" onTabOpen={(e) => {
                // lazy load the history
                setLoadHistory(true);
                setBusy(true)
            }}>
                <AccordionTab header="הסטוריית שיבוצים" >
                    <div className="p-3" style={{ direction: 'rtl', height: 200, overflowY: "scroll" }}>
                        {history? history.map((entry, i) => (
                            <div key={i} className="flex align-items-center justify-content-between border-bottom py-2">
                                <div style={{ width: "25%" }}>{dayjs(entry.date).format("DD/MM")}</div>
                                <div style={{ width: "35%" }}>{entry.name}</div>
                                <div style={{ width: "20%" }}>{entry.status}</div>
                                <div style={{ width: "20%" }} className="flex gap-3 justify-content-end">
                                    {/* <Button icon="pi pi-check" className="p-button-sm p-button-text" title="בחר" onClick={()=>setSelectedCook(entry.info)} /> */}
                                    <WhatsAppButton getPhone={() => entry.phone} getText={() => ""}/>
                                    {/* <Button icon="pi pi-phone" className="p-button-sm p-button-text" title="התקשר" /> */}
                                </div>
                            </div>
                        )):<h4>טוען...</h4>}
                    </div>
                </AccordionTab>
            </Accordion>
            <div className="flex justify-content-center text-xl">שיבוץ מתנדב</div>

            <div className="flex justify-content-end">
                <AutoComplete
                    inputClassName="w-17rem md:w-15rem"
                    placeholder={!selectedCook ? "חיפוש לפי שם פרטי, משפחה או טלפון" : undefined}
                    delay={500}
                    value={selectedCook}
                    field="name"
                    optionGroupLabel="districtName"
                    optionGroupChildren="users"
                    suggestions={filteredUsers}
                    completeMethod={async (event: AutoCompleteCompleteEvent) => {
                        const newFilter = await handleSearchUsers(userInfo, event.query);
                        setFilteredUsers(newFilter);
                    }}
                    onChange={(e) => setSelectedCook(e.value)}
                    inputStyle={{ textAlign: 'right' }}
                    itemTemplate={(item) => (
                        <div style={{ textAlign: 'right' }}>{item.name}</div>
                    )}
                />
            </div>
            <div className="flex justify-content-center mt-2">
                <SelectDays dateInfo={selectedDateInfo!} OnSelectDate={(date) => setSelectedCookDay(date)} dateSelected={selectedCookDay} />
            </div>
            <div className="flex justify-content-end mt-2">
                <Button label="ביטול" onClick={() => onClose(false)} className="p-button-secondary ml-2" />
                <Button
                    label="אשר"
                    disabled={!selectedCook || !selectedCookDay}
                    onClick={async () => {
                        if (!selectedDateInfo || !selectedCook || !selectedCookDay) return;
                        setBusy(true);
                        try {
                            await updateFamilyDemand(
                                selectedDateInfo.demandId,
                                selectedCookDay,
                                selectedDateInfo.mainBaseFamilyId,
                                familyDetails?.cityId || "cityId(unknown)",
                                true,
                                selectedDateInfo.type,
                                `שובץ ע״י מנהל`,
                                selectedDateInfo.district,
                                selectedCook.id
                            );
                            appServices.showMessage("success", "שיבוץ בוצע", "");
                            onClose(true);
                        } catch (err) {
                            // @ts-ignore
                            appServices.showMessage("error", "שגיאה בשיבוץ", err.message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
            </div>
        </Dialog>
    )
}

export default function SelectDays({ dateInfo, OnSelectDate, dateSelected }:
    { dateInfo: DateInfo, OnSelectDate: (date: string) => void, dateSelected: string | null }) {
    if (!dateInfo) return null;

    const date = dayjs(dateInfo.date);

    const items: { name: string, value: string }[] = dateInfo.expandDays.map((d) => ({ name: `יום ${DAYS[date.add(d, "day").day()]}, ${date.add(d, "day").format("DD/MM")} `, value: date.add(d, "day").format(DATE_AT) }))

    return (
        <div className="card flex justify-content-center">
            <SelectButton value={dateSelected} onChange={(e) => OnSelectDate(e.value)} optionLabel="name" options={items} multiple />
        </div>
    );
}
