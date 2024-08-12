import React, { useEffect, useState, useRef } from 'react';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import OneNotification from './one-notification';
import { Menu } from 'primereact/menu';
import { MenuItem } from 'primereact/menuitem';
import dayjs from 'dayjs';
import { getUserRegistrations } from './api';
import { SelectButton } from 'primereact/selectbutton';
import { RegistrationRecord } from './types';
import { ProgressBar } from 'primereact/progressbar';

const Filters = {
    ALL: 1,
    FUTURE: 2,
    array: [
        { name: 'הכל', value: 1 },
        { name: 'עתידי', value: 2 },
    ]
}
export function ExistingRegistrationsComponent() {
    const [registrations, setRegistrations] = useState<RegistrationRecord[] | undefined>(undefined);
    const [filter, setFilter] = useState(Filters.ALL);
    const [error, setError] = useState<any>(undefined);



    useEffect(() => {
        getUserRegistrations().then((regs) => setRegistrations(regs))
            .catch(err => setError(err));;
    }, []);

    const isInFuture = (date: string) => {
        return dayjs().diff(dayjs(date)) <= 0;
    }


    if (error) return (
        <div>תקלת טעינה - {error.message}</div>
    )

    if (!registrations) return (
        <>
            <ProgressBar mode="indeterminate" style={{ height: '6px' }}></ProgressBar>
            <div>נתונים נטענים...</div>
        </>
    );

    if (registrations.length == 0) return (
        <div>לא נמצאו נתונים...</div>
    )
    const registrationsToShow = registrations?.filter(r => filter === Filters.ALL || filter === Filters.FUTURE && isInFuture(r.date));

    return (
        <div>
            נתוני דמה
            <div className='flex flex-row relative'>
                <SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={filter} onChange={(e) => setFilter(e.value)} optionLabel="name" options={Filters.array}
                    itemTemplate={(option) => (
                        <div className={`select-button-item ${filter === option.value ? 'p-highlight' : ''}`}>
                            {option.name}
                        </div>
                    )}
                />
            </div>

            <div className="surface-ground px-4 py-5 md:px-6 lg:px-8">
                <div className="grid">
                    {registrationsToShow?.length ?
                        registrationsToShow.map(reg => (
                            <OneNotification
                                key={reg.id}
                                title={reg.familyLastName}
                                body={reg.city}
                                footer={dayjs(reg.date).format("[יום ]dddd, D [ב]MMMM")}
                                unread={isInFuture(reg.date)}
                                onRead={() => { }}
                            />
                        )) :
                        <div className='no-messages'>אין רישומים</div>
                    }

                </div>
            </div>
        </div>
    );
};

