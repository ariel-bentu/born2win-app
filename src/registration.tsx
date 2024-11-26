import React, { useState, useEffect } from 'react';
import { MultiSelect } from 'primereact/multiselect';
import headerImg from './media/header.png';
import bunnerImg from './media/reg-banner.png';
import holidayTreatImg from './media/holiday-treat-banner.png';
import footerImg from './media/registration-footer.png';

import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import "./registration.css";
import { FamilyDetailsComponent } from './family-registration-details';

import { InProgress } from './common-ui';
import { AppServices, City, FamilyCompact, FamilyDemand, OpenFamilyDemands, ShowToast, UserInfo, VolunteerType } from './types';
import OneLine from './one-line';
import { getUniqueFamilies } from './utils';
import { ScrollPanel } from 'primereact/scrollpanel';
import { analyticLog } from './api';
import { oldUrlParamID } from './App';
import { Button } from 'primereact/button';
import { SelectButton } from 'primereact/selectbutton';
import { Dialog } from 'primereact/dialog';

function cleanseCityName(cityName: string) {
    return cityName.replace(/["\n\s]/g, '');
}

function compareCities(c1: string, c2: string) {
    return cleanseCityName(c1) === cleanseCityName(c2);
}


const Filters = {
    array: [
        { name: 'ארוחות', value: VolunteerType.Meal },
        { name: 'פינוקי חג', value: VolunteerType.HolidayTreat },
    ]
}

interface RegistrationComponentProps {
    userInfo: UserInfo | null;
    openDemands: Promise<OpenFamilyDemands>;
    actualUserId: string
    appServices: AppServices;
    openDemandsTS: string;
    reloadOpenDemands: () => void;
    standalone?: boolean;
    topPosition: number;
}

interface CityAvailability {
    id: string;
    name: string;
    available: boolean;
}

function RegistrationComponent({ openDemands, appServices, actualUserId, openDemandsTS,
    reloadOpenDemands, standalone, topPosition, userInfo }: RegistrationComponentProps) {
    const [cities, setCities] = useState<CityAvailability[]>([]);
    const [selectedCities, setSelectedCities] = useState<City[]>([]);
    const [familyDemands, setFamilyDemands] = useState<FamilyDemand[] | null>(null);
    const [families, setFamilies] = useState<FamilyCompact[]>([]);
    const [selectedFamily, setSelectedFamily] = useState<FamilyCompact | null>(null);
    const [error, setError] = useState<any>(undefined);
    const [mode, setMode] = useState<VolunteerType>(VolunteerType.Meal);
    const [holidayTreatsExists, setHolidayTreatsExists] = useState<boolean>(false);
    const [showWhatsHolidayTreats, setShowWhatsHolidayTreats] = useState<boolean>(false);

    const analyticComponent = oldUrlParamID !== null ? "LinkRegistration" : "Registration";

    useEffect(() => {
        analyticLog(analyticComponent, "open");
        setSelectedCities([])
        openDemands.then().then((demands: OpenFamilyDemands) => {
            setHolidayTreatsExists(demands.demands.some(d => d.type == VolunteerType.HolidayTreat));
            const demandsForType = demands.demands.filter(demand => demand.type == mode);

            setFamilyDemands(demandsForType);

            // calculate the cities' availability
            const cities = demands.allDistrictCities.map(city => ({ ...city, available: (demandsForType.some(d => compareCities(d.familyCityName, city.name))) } as CityAvailability));
            setCities(cities);
            if (cities.length == 1) {
                console.log("cities", cities)
                setSelectedCities([cities[0]]);
            }

            const uniqueFamilies = getUniqueFamilies(demandsForType);
            setFamilies(uniqueFamilies);

        }).catch(err => setError(err));
    }, [actualUserId, openDemandsTS, mode]);


    if (error) return (
        <div>תקלת טעינה - {error.message}</div>
    )

    if (!familyDemands) return (
        <>
            <InProgress />
            <div>נתונים נטענים...</div>
        </>
    );

    if (familyDemands.length == 0) {
        analyticLog(analyticComponent, "no open dates");
        return (
            <div>לא נותרו משפחות לשיבוץ לתקופה הקרובה - אם מישהו יבטל תקבלו הודעה </div>
        )
    }


    const selectedFamilyDemand = selectedFamily ? familyDemands.filter(fd => fd.mainBaseFamilyId === selectedFamily.mainBaseFamilyId) : undefined;
    const filteredFamilies = families.filter(family => selectedCities.some(sc => compareCities(sc.name, family.city)));
    return (
        <div className="registration-component">



            {!selectedFamily && userInfo?.isAdmin && holidayTreatsExists &&

                <div className='flex flex-row justify-content-center relative'>
                    <SelectButton
                        pt={{ root: { className: "select-button-container" } }}
                        unstyled
                        value={mode}
                        onChange={(e) => setMode(e.value)}
                        optionLabel="name"
                        options={Filters.array}
                        itemTemplate={(option) => (
                            <div className={`select-button-item ${mode === option.value ? 'p-highlight' : ''}`}>
                                {option.name}
                            </div>
                        )}
                    />
                    <a
                        style={{
                            color: "blue",
                            cursor: "pointer",
                            textDecoration: "underline",
                        }}
                        onClick={() => setShowWhatsHolidayTreats(true)}
                    >
                        מה זה?
                    </a>
                </div>
            }
            <Dialog  style={{direction:"rtl"}} visible={showWhatsHolidayTreats} onHide={() => setShowWhatsHolidayTreats(false)} header=" מה זה פינוקי חג?">
                <div className='registration-explain'>
                    גם השנה ממשיכים במסורת של נולדת לנצח ונשלח למשפחות שלנו פינוקים לכבוד החג.💜
                    <br/><br/>
                    מה זה פינוקים?! עוגה/עוגיות/ מארז טעים וכל מה שבא לכם להכין באווירת החג שיהיה להם מתוק בנשמה .
                    אפשרי לשתף את הילדים להכין ברכה מהממת 💞🌟
                    <br/><br/>
                    מתי?<br/>
                    בשבוע של החג מוסרים בתיאום מראש לפי מה שנוח לכם
                </div>
            </Dialog>

            <div className="img-header">
                {standalone && <img src={headerImg} />}
            </div>
            {standalone && <img src={bunnerImg} alt="Registration Banner" style={{ maxWidth: "100%" }} />}
            {standalone && <div>
                <div className='standalone-title bm-4'>נולדת לנצח - מחוז {userInfo && userInfo.userDistrict.name}</div>
                <div className='m-2 standalone-text-desc'>
                    <div className='m-2'>{userInfo && (userInfo.firstName + " " + userInfo.lastName)}</div>
                    היי אנחנו מודים לך על הבחירה לחבק חולים ולהכניס להם נצנצים הביתה.
                    <br />
                    יש לבחור מטה את הערים שבהן תרצו לחבק משפחה. לאחר מכן בחרו משפחה כדי לראות באלו ימים ניתן למסור לה את הארוחות
                </div>

            </div>}
            <div className={standalone ? 'standalone-dynamic-host' : "w-full"}>
                <ScrollPanel style={{ width: "100%", height: standalone ? "100%" : window.innerHeight - topPosition }}
                    pt={{
                        wrapper: { className: "registration-scroller-wrapper", style: { paddingTop: standalone ? 40 : 0 } },
                        content: { className: "registration-scroller-content " + (standalone ? "standalone-card" : ""), style: { width: Math.max(window.innerWidth - 50, 350) } }  // Pass class to the content
                    }}

                >
                    {!standalone && !selectedFamily &&
                        <img src={mode == VolunteerType.Meal ? bunnerImg : holidayTreatImg} alt="Registration Banner" style={{ maxWidth: "70%" }} />}



                    {selectedFamily ?
                        <FamilyDetailsComponent
                            analyticComponent={analyticComponent}
                            mainBaseFamilyId={selectedFamily.mainBaseFamilyId} family={selectedFamily} onClose={() => {
                                setSelectedFamily(null);
                                appServices.popNavigationStep();
                            }}
                            appServices={appServices} demands={selectedFamilyDemand || []}
                            reloadOpenDemands={reloadOpenDemands} includeContacts={false}
                            actualUserId={actualUserId}
                            additionalHeader={mode == VolunteerType.HolidayTreat ? "פינוקי חגים" : undefined}
                            type={mode}
                        /> :
                        <>
                            {standalone && <span className='standalone-text-title'>אלו הערים שבהן ניתן לחבק משפחות החודש</span>}
                            <MultiSelect
                                value={selectedCities}
                                options={cities.map(city => ({ label: city.name + (city.available ? "" : " (כל התאריכים תפוסים)"), value: city }))}
                                onChange={(e) => setSelectedCities(e.value)}
                                placeholder="סינון לפי עיר"
                                className="w-11 m-2"// md:w-20rem"
                                display="chip"
                            />
                            {selectedCities.length > 0 && <span className='standalone-text-title'>רשימת משפחות</span>}
                            {selectedCities.length == 0 && <span className='standalone-text-desc  w-11 mt-1 text-right'>יש לבחור עיר כדי לראות משפחות</span>}
                            {
                                filteredFamilies.map((family, i) => (<OneLine
                                    key={i}
                                    title={family.familyLastName}
                                    body={`עיר: ${family.city}`}
                                    unread={false}
                                    onRead={() => {
                                        console.log("family click", family.familyLastName)
                                        setSelectedFamily(family)
                                        appServices.pushNavigationStep("registration-family", () => {
                                            setSelectedFamily(null)
                                        })
                                    }}
                                />))
                            }
                        </>
                    }
                </ScrollPanel>

            </div>

            {standalone && <img src={footerImg} style={{ maxWidth: "100%" }} />}
        </div>
    );
};

export default RegistrationComponent;