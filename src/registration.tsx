import React, { useState, useEffect } from 'react';
import { MultiSelect } from 'primereact/multiselect';

import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import "./registration.css";
import { FamilyDetailsComponent } from './famility-registration-details';

import { InProgress } from './common-ui';
import { City, FamilyCompact, FamilyDemand, ShowToast } from './types';
import OneLine from './one-line';
import { getUniqueFamilies } from './utils';


interface RegistrationComponentProps {
    openDemands: Promise<FamilyDemand[]>;
    actualUserId: string
    showToast: ShowToast;
    openDemandsTS: string;
    reloadOpenDemands: ()=>void;
}

function RegistrationComponent({ openDemands, showToast, actualUserId, openDemandsTS, reloadOpenDemands }: RegistrationComponentProps) {
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

    if (selectedFamily) {
        const selectedFamilyDemand = familyDemands.filter(fd=>fd.familyRecordId === selectedFamily.familyId);
        return (
            <div className="p-m-4">
                <FamilyDetailsComponent family={selectedFamily} onClose={() => setSelectedFamily(null)} 
                showToast={showToast} demands={selectedFamilyDemand} 
                reloadOpenDemands={reloadOpenDemands}/>
            </div>
        );
    }

    const filteredFamilies = families.filter(family => selectedCities.length == 0 || selectedCities.some(sc => sc.name === family.city))

    return (
        <div className="registration-component">
            <div className="city-selection">
                <MultiSelect
                    value={selectedCities}
                    options={cities.map(city => ({ label: city.name, value: city }))}
                    onChange={(e) => setSelectedCities(e.value)}
                    placeholder="סינון לפי עיר"
                    className="w-full md:w-20rem"
                    display="chip"
                />
            </div>
            {
                filteredFamilies.map((family, i) => <OneLine
                    key={i}
                    title={family.familyLastName}
                    body={`עיר: ${family.city}`}
                    unread={false}
                    onRead={() => {
                        console.log("family click", family.familyLastName)
                        setSelectedFamily(family)
                    }}
                />)}
        </div>
    );
};

export default RegistrationComponent;