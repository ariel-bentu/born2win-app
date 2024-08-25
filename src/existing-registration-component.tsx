import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getUserRegistrations } from './api';
import { SelectButton } from 'primereact/selectbutton';
import { FamilyCompact, FamilyDemand, NavigationStep, ShowToast } from './types';

import { InProgress } from './common-ui';
import OneLine from './one-line';
import RegistrationCancellation from './registration-cancellation';
import { NICE_DATE } from './utils';
import { FamilyDetailsComponent } from './famility-registration-details';

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
    navigationRequest?: NavigationStep,
    actualUserId: string
}

export function ExistingRegistrationsComponent({ showToast, navigationRequest, actualUserId }: ExistingRegistrationsComponentProps) {
    const [registrations, setRegistrations] = useState<FamilyDemand[] | undefined>();
    const [filter, setFilter] = useState(Filters.ALL);
    const [error, setError] = useState<any>(undefined);
    const [currentRegistration, setCurrentRegistration] = useState<FamilyDemand | undefined>();
    const [loading, setLoading] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [showCancellationDialog, setShowCancellationDialog] = useState<FamilyDemand | null>(null);

    useEffect(() => {
        setLoading(true);

        const setCurrentRegistrationByNavigationRequest = navigationRequest && navigationRequest.params && navigationRequest.params.length > 0
            ? navigationRequest.params[0] : undefined;

        getUserRegistrations().then((regs) => {
            regs.sort((a, b) => a.date > b.date ? 1 : -1);
            console.log("registrations loaded", regs?.length)
            setRegistrations(regs);
            if (setCurrentRegistrationByNavigationRequest) {
                const navTo = regs.find(reg => reg.id);
                setCurrentRegistration(navTo);
            }
        })
            .catch(err => setError(err))
            .finally(() => setLoading(false));
    }, [reload, actualUserId]);

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

    if (currentRegistration) {
        const currentFamily = {
            city: currentRegistration.city,
            familyId: currentRegistration.familyRecordId,
            familyLastName: currentRegistration.familyLastName
        } as FamilyCompact;
        console.log("reg id", currentRegistration.id)
        return <FamilyDetailsComponent detailsOnly={true} family={currentFamily} onClose={() => setCurrentRegistration(undefined)}
            showToast={showToast} demands={registrations} reloadOpenDemands={() => { }} />
    }

    if (showCancellationDialog) {
        return <RegistrationCancellation
            onClose={() => setShowCancellationDialog(null)}
            onCancellationPerformed={() => {
                setShowCancellationDialog(null);
                showToast("success", "ביטול נקלט", "");
                setCurrentRegistration(undefined);
                setReload(prev => prev + 1);
            }}
            onError={(err) => showToast("error", "ביטול רישום נכשל", err.message)}
            registration={showCancellationDialog}
        />;
    }

    const registrationsToShow = registrations?.filter(r => filter === Filters.ALL || filter === Filters.FUTURE && isInFuture(r.date));
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

            {loading && <InProgress />}
            <div className="surface-ground px-4 py-5 md:px-6 lg:px-8">
                <div className="grid">
                    {registrationsToShow?.length ?
                        registrationsToShow.map(reg => (
                            <OneLine
                                key={reg.id}
                                title={reg.familyLastName}
                                body={`עיר: ${reg.city}`}
                                footer={dayjs(reg.date).format(NICE_DATE)}
                                unread={isInFuture(reg.date)}
                                onRead={() => {
                                    setCurrentRegistration(reg);
                                }}
                                onDelete={dayjs(reg.date).isBefore(dayjs()) ?
                                    undefined : // only allow deleting future commitments
                                    () => setShowCancellationDialog(reg)}
                                deleteLabel={"ביטול שיבוץ"}
                            />
                        )) :
                        <div className='no-messages'>אין רישומים</div>
                    }
                </div>
            </div>
        </div>
    );
};

