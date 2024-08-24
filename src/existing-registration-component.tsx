import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Family, getFamilyDetails, getUserRegistrations, updateFamilityDemand } from './api';
import { SelectButton } from 'primereact/selectbutton';
import { RegistrationRecord, ShowToast } from './types';

import { FamilyDetails } from './famility-registration-details';
import { InProgress } from './common-ui';
import OneLine from './one-line';
import { confirmPopup } from 'primereact/confirmpopup';

const Filters = {
    ALL: 1,
    FUTURE: 2,
    array: [
        { name: 'הכל', value: 1 },
        { name: 'עתידי', value: 2 },
    ]
}
interface ExistingRegistrationsComponentProps {
    showToast: ShowToast;
}

export function ExistingRegistrationsComponent({ showToast }: ExistingRegistrationsComponentProps) {
    const [registrations, setRegistrations] = useState<RegistrationRecord[] | undefined>(undefined);
    const [filter, setFilter] = useState(Filters.ALL);
    const [error, setError] = useState<any>(undefined);
    const [showFamilyId, setShowFamilyId] = useState<string | undefined>();
    const [currentFamily, setCurrentFamily] = useState<Family | undefined>();
    const [showProgress, setShowProgress] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);

    useEffect(() => {
        getUserRegistrations().then((regs) => {
            regs.sort((a, b) => a.date > b.date ? 1 : -1);
            setRegistrations(regs);
        })
            .catch(err => setError(err));
    }, [reload]);

    useEffect(() => {
        if (showFamilyId) {
            setShowProgress(true);
            getFamilyDetails(showFamilyId).then((f) => setCurrentFamily(f))
                .catch(err => setError(err))
                .finally(() => setShowProgress(false));
        } else {
            setCurrentFamily(undefined);
        }
    }, [showFamilyId]);

    const isInFuture = (date: string) => {
        return dayjs().diff(dayjs(date)) <= 0;
    }

    if (error) return (
        <div>תקלת טעינה - {error.message}</div>
    )

    if (!registrations) return (
        <>
            <InProgress />
            <div>נתונים נטענים...</div>
        </>
    );

    if (registrations.length == 0) return (
        <div>לא נמצאו נתונים...</div>
    )

    if (currentFamily) {
        return <FamilyDetails detailsOnly={true} family={currentFamily} onClose={() => setShowFamilyId(undefined)} showToast={showToast} cityId={currentFamily.fields.city_id_1} />
    }

    const registrationsToShow = registrations?.filter(r => filter === Filters.ALL || filter === Filters.FUTURE && isInFuture(r.date));
    console.log(registrationsToShow)
    return (
        <div>
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

            {showProgress && <InProgress />}
            <div className="surface-ground px-4 py-5 md:px-6 lg:px-8">
                <div className="grid">
                    {registrationsToShow?.length ?
                        registrationsToShow.map(reg => (
                            <OneLine
                                key={reg.id}
                                title={reg.familyLastName}
                                body={reg.city}
                                footer={dayjs(reg.date).format("[יום ]dddd, D [ב]MMMM")}
                                unread={isInFuture(reg.date)}
                                onRead={() => {
                                    setShowFamilyId(reg.familyRecordId);
                                }}
                                onDelete={dayjs(reg.date).isBefore(dayjs()) ? undefined : // only allow deleting future commitments
                                    (event) => {
                                        confirmPopup({
                                            target: event.currentTarget as any,
                                            message: 'האם לבטל שיבוץ נוכחי?',
                                            icon: 'pi pi-exclamation-triangle',
                                            accept: () => {
                                                updateFamilityDemand(reg.id, reg.familyId, "cityId(unknown)", false).then(() => {
                                                    showToast("success", "ביטול נקלט", "")
                                                })
                                                    .catch((err) => showToast("error", "תקלה ברישום הביטול (2) - ", err.message))
                                                    .finally(() => {
                                                        setShowFamilyId(undefined);
                                                        setReload(prev => prev + 1);
                                                    });
                                            }
                                        });
                                    }}
                            />
                        )) :
                        <div className='no-messages'>אין רישומים</div>
                    }
                </div>
            </div>
        </div>
    );
};

