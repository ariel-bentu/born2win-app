import React, { useState, useEffect } from 'react';
import { MultiSelect } from 'primereact/multiselect';
import headerImg from './media/header.png';
import bunnerImg from './media/reg-banner.png';
import footerImg from './media/registration-footer.png';

import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import "./registration.css";
import { FamilyDetailsComponent } from './famility-registration-details';

import { InProgress } from './common-ui';
import { City, FamilyCompact, FamilyDemand, ShowToast } from './types';
import OneLine from './one-line';
import { getUniqueFamilies } from './utils';
import { ScrollPanel } from 'primereact/scrollpanel';


interface RegistrationComponentProps {
    openDemands: Promise<FamilyDemand[]>;
    actualUserId: string
    showToast: ShowToast;
    openDemandsTS: string;
    reloadOpenDemands: () => void;
    standalone?: boolean;
    topPosition: number;
}

function RegistrationComponent({ openDemands, showToast, actualUserId, openDemandsTS,
    reloadOpenDemands, standalone, topPosition }: RegistrationComponentProps) {
    const [cities, setCities] = useState<City[]>([]);
    const [selectedCities, setSelectedCities] = useState<City[]>([]);
    const [familyDemands, setFamilyDemands] = useState<FamilyDemand[] | null>(null);
    const [families, setFamilies] = useState<FamilyCompact[]>([]);
    const [selectedFamily, setSelectedFamily] = useState<FamilyCompact | null>(null);
    const [error, setError] = useState<any>(undefined);

    useEffect(() => {
        setSelectedCities([])
        openDemands.then().then((demands: FamilyDemand[]) => {
            setFamilyDemands(demands);
            const cities = getUniqueCities(demands);
            setCities(cities);
            if (cities.length == 1) {
                console.log("cities", cities)
                setSelectedCities([cities[0]]);
            }

            const uniqueFamilies = getUniqueFamilies(demands);
            setFamilies(uniqueFamilies);

        }).catch(err => setError(err));
    }, [actualUserId, openDemandsTS]);


    const getUniqueCities = (records: FamilyDemand[]): City[] => {
        const result = [] as City[];
        records.forEach((fd, i) => {
            if (!result.find(f => f.name === fd.city)) {
                result.push({
                    id: i + "",
                    name: fd.city,
                })
            }
        })
        return result;
    };

    if (error) return (
        <div>תקלת טעינה - {error.message}</div>
    )

    if (!familyDemands) return (
        <>
            <InProgress />
            <div>נתונים נטענים...</div>
        </>
    );

    if (familyDemands.length == 0) return (
        <div>לא נמצאו נתונים...</div>
    )

    const selectedFamilyDemand = selectedFamily ? familyDemands.filter(fd => fd.familyRecordId === selectedFamily.familyId) : undefined;
    const filteredFamilies = families.filter(family => selectedCities.some(sc => sc.name === family.city))

    return (
        <div className="registration-component">
            <div className="img-header">
                {standalone && <img src={headerImg} />}
            </div>
            {standalone && !selectedFamily && <img src={bunnerImg} alt="Registration Banner" style={{ maxWidth: "100%" }} />}
            {standalone && !selectedFamily && <div>
                <div className='standalone-title bm-4'>נולדת לנצח - מחוז יהודה ושומרון</div>
                <div className='m-2'>
                    היי אנחנו מודים לך על הבחירה לחבק חולים ולהכניס להם נצנצים הביתה.
                    <br />
                    יש לבחור מטה את הערים שבהן תרצו לחבק משפחה. לאחר מכן בחרו משפחה כדי לראות באלו ימים ניתן למסור לה את הארוחות
                </div>

            </div>}
            <div className={standalone ? 'standalone-dynamic-host' : "w-full"}>
                <ScrollPanel style={{ width: "100%", height: window.innerHeight - topPosition }}
                    pt={{
                        wrapper: { className: "registration-scroller-wrapper" },
                        content: { className: "registration-scroller-content " + (standalone ? "standalone-card" : "") }  // Pass class to the content
                    }}

                >
                    {selectedFamily ?
                        <FamilyDetailsComponent familyId={selectedFamily.familyId} family={selectedFamily} onClose={() => setSelectedFamily(null)}
                            showToast={showToast} demands={selectedFamilyDemand || []}
                            reloadOpenDemands={reloadOpenDemands} includeContacts={false} /> :
                        <>
                            <MultiSelect
                                value={selectedCities}
                                options={cities.map(city => ({ label: city.name, value: city }))}
                                onChange={(e) => setSelectedCities(e.value)}
                                placeholder="סינון לפי עיר"
                                className="w-11 m-2"// md:w-20rem"
                                display="chip"
                            />
                            {
                                filteredFamilies.map((family, i) => (<OneLine
                                    key={i}
                                    title={family.familyLastName}
                                    body={`עיר: ${family.city}`}
                                    unread={false}
                                    onRead={() => {
                                        console.log("family click", family.familyLastName)
                                        setSelectedFamily(family)
                                    }}
                                    hideIcon={true}
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