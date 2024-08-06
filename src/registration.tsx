import React, { useState, useEffect } from 'react';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'primereact/button';
import { Family, getMealRequests } from './api';

import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import OneNotification from './one-notification';
import "./registration.css";

interface CitySelectionProps {
    cities: string[];
    onCityChange: (selectedCities: string[]) => void;
}

const CitySelection: React.FC<CitySelectionProps> = ({ cities, onCityChange }) => {
    const [selectedCities, setSelectedCities] = useState<string[]>([]);

    const handleCityChange = (e: any) => {
        setSelectedCities(e.value);
        onCityChange(e.value);
    };

    return (
        <div className="city-selection">
            <h2>בחר עיר</h2>
            <MultiSelect
                value={selectedCities}
                options={cities.map(city => ({ label: city, value: city }))}
                onChange={handleCityChange}
                placeholder="בחר עיר"
                className="w-full md:w-20rem"
                display="chip"
            />
        </div>
    );
};

interface FamilyListProps {
    families: Family[];
    onFamilyClick: (family: Family) => void;
}

const FamilyList: React.FC<FamilyListProps> = ({ families, onFamilyClick }) => {
    return (
        <div className="family-list">
            {families.map((family) => (
                <OneNotification
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

interface FamilyDetailsProps {
    family: Family | null;
    onClose: () => void;
}

const FamilyDetails: React.FC<FamilyDetailsProps> = ({ family, onClose }) => {
    if (!family) return null;

    return (
        <div className="surface-card shadow-2 p-3 border-round">
            <h2>{family.fields.Name}</h2>
            <p><strong>כשרות מטבח:</strong> {family.fields['כשרות מטבח']}</p>
            <p><strong>אוהבים לאכול:</strong> {family.fields['אוהבים לאכול']}</p>
            <p><strong>רגישויות ואלרגיות:</strong> {family.fields['רגישויות ואלרגיות (from בדיקת ההתאמה)']}</p>
            <p><strong>נפשות מבוגרים בבית:</strong> {family.fields['נפשות מבוגרים בבית']}</p>
            <p><strong>גילאים של הרכב המשפחה:</strong> {family.fields['גילאים של הרכב המשפחה']}</p>
            <p><strong>מחוז:</strong> {family.fields['מחוז']}</p>
            <p><strong>קומה:</strong> {family.fields['קומה']}</p>
            <Button label="סגור" onClick={onClose} />
        </div>
    );
};

const RegistrationComponent: React.FC = () => {
    const [cities, setCities] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [families, setFamilies] = useState<Family[] | null>(null);
    const [filteredFamilies, setFilteredFamilies] = useState<Family[]>([]);
    const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
    const [error, setError] = useState<any>(undefined);

    useEffect(() => {
        getMealRequests().then((records: Family[]) => {
            setFamilies(records);
            setCities(getUniqueCities(records));
        }).catch(err=>setError(err));
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
        <div>נתונים נטענים...</div>
    );

    if (families.length == 0) return (
        <div>לא נמצאו נתונים...</div>
    )

    if (selectedFamily) return (
        <div className="p-m-4">
            <FamilyDetails family={selectedFamily} onClose={() => setSelectedFamily(null)} />
        </div>
    );

    return (
        <div className="registration-component">
            <CitySelection cities={cities} onCityChange={setSelectedCities} />
            {filteredFamilies.length ?
                <FamilyList families={filteredFamilies} onFamilyClick={setSelectedFamily} /> :
                <div>בחר עיר תחילה...</div>}
        </div>
    );
};

export default RegistrationComponent;