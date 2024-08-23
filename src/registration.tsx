import React, { useState, useEffect } from 'react';
import { MultiSelect } from 'primereact/multiselect';
import { Family } from './api';

import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import "./registration.css";
import { FamilyDetails } from './famility-registration-details';

import { InProgress } from './common-ui';
import { ShowToast } from './types';
import OneLine from './one-line';


interface FamilyListProps {
    families: Family[];
    onFamilyClick: (family: Family) => void;
}

const FamilyList: React.FC<FamilyListProps> = ({ families, onFamilyClick }) => {
    return (
        <div className="family-list">
            {families.map((family) => (
                <OneLine
                    key={family.id}
                    title={family.fields.Name}
                    body={`עיר: ${family.fields['עיר']}, גיל: ${family.fields['גיל החולה']}`}
                    unread={false}
                    footer={`סוג ארוחה מועדף: ${family.fields['העדפה לסוג ארוחה'].join(', ')}`}
                    onRead={() => {
                        console.log("family click", family.fields.Name)
                        onFamilyClick(family)
                    }}
                />
            ))}
        </div>
    );
};

interface RegistrationComponentProps {
    getCachedMealRequest: () => Promise<Family[]>;
    showToast: ShowToast;
}

function RegistrationComponent({ getCachedMealRequest , showToast}: RegistrationComponentProps) {
    const [cities, setCities] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [families, setFamilies] = useState<Family[] | null>(null);
    const [filteredFamilies, setFilteredFamilies] = useState<Family[]>([]);
    const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
    const [error, setError] = useState<any>(undefined);

    useEffect(() => {
        getCachedMealRequest().then((records: Family[]) => {
            setFamilies(records);
            const cities = getUniqueCities(records);
            setCities(cities);
            if (cities.length == 1) {
                console.log("cities", cities)
                setSelectedCities([cities[0]]);
            }
        }).catch(err => setError(err));
    }, []);

    useEffect(() => {
        if (selectedCities.length === 0) {
            setFilteredFamilies([]);
        } else {
            if (families) {
                setFilteredFamilies(families.filter(family => selectedCities.includes(family.fields['עיר'])));
            }
        }
    }, [selectedCities, families]);


    const getUniqueCities = (records: Family[]): string[] => {
        const cities = new Set(records.map(record => record.fields['עיר']));
        return Array.from(cities);
    };

    if (error) return (
        <div>תקלת טעינה - {error.message}</div>
    )

    if (!families) return (
        <>
            <InProgress />
            <div>נתונים נטענים...</div>
        </>
    );

    if (families.length == 0) return (
        <div>לא נמצאו נתונים...</div>
    )

    if (selectedFamily) return (
        <div className="p-m-4">
            <FamilyDetails family={selectedFamily} onClose={() => setSelectedFamily(null)} showToast={showToast}/>
        </div>
    );

    return (
        <div className="registration-component">
            <div className="city-selection">
                <MultiSelect
                    value={selectedCities}
                    options={cities.map(city => ({ label: city, value: city }))}
                    onChange={(e)=>setSelectedCities(e.value)}
                    placeholder="בחר עיר"
                    className="w-full md:w-20rem"
                    display="chip"
                />
            </div>
            {filteredFamilies.length ?
                <FamilyList families={filteredFamilies} onFamilyClick={setSelectedFamily} /> :
                <div>בחר עיר תחילה...</div>}
        </div>
    );
};

export default RegistrationComponent;