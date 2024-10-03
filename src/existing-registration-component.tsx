import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getUserRegistrations } from './api';
import { SelectButton } from 'primereact/selectbutton';
import { AppServices, FamilyCompact, FamilyDemand, NavigationStep, UserInfo } from './types';

import { InProgress } from './common-ui';
import OneLine from './one-line';
import RegistrationCancellation from './registration-cancellation';
import { getReferenceDays, NICE_DATE, sortByDateDesc } from './utils';
import { FamilyDetailsComponent } from './famility-registration-details';

const Filters = {
    ALL: 2,
    FUTURE: 1,
    array: [
        { name: 'עתידי', value: 1 },
        { name: 'הכל', value: 2 },
    ]
}
interface ExistingRegistrationsComponentProps {
    appServices: AppServices;
    navigationRequest?: NavigationStep,
    actualUserId: string
    userInfo: UserInfo | null;
}

export function ExistingRegistrationsComponent({ appServices, navigationRequest, actualUserId, userInfo }: ExistingRegistrationsComponentProps) {
    const [registrations, setRegistrations] = useState<FamilyDemand[] | undefined>();
    const [filter, setFilter] = useState(Filters.FUTURE);
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
            //regs.sort((r1, r2) => sortByDateDesc(r1.date, r2.date));

            regs.sort((r1, r2) => {
                const today = dayjs(); // Get today's date
            
                const date1 = dayjs(r1.date);
                const date2 = dayjs(r2.date);
            
                const isDate1FutureOrToday = date1.isToday() || date1.isAfter(today, 'day'); 
                const isDate2FutureOrToday = date2.isToday() || date2.isAfter(today, 'day'); 
            
                // Case 1: Both dates are in the future or today
                if (isDate1FutureOrToday && isDate2FutureOrToday) {
                    return date1.isAfter(date2) ? 1 : -1; // Closer future date comes first
                }
            
                // Case 2: Both dates are in the past
                if (!isDate1FutureOrToday && !isDate2FutureOrToday) {
                    return date1.isBefore(date2) ? 1 : -1; // More recent past date comes first
                }
            
                // Case 3: One is in the future/today, the other is in the past
                return isDate1FutureOrToday ? -1 : 1; // Future/today comes before past
            });


            console.log("registrations loaded", regs?.length)
            setRegistrations(regs);
            if (setCurrentRegistrationByNavigationRequest) {
                const navTo = regs.find(reg => reg.id);
                setCurrentRegistration(navTo);
                appServices.pushNavigationStep("registration", () => setCurrentRegistration(undefined));
            }
        })
            .catch(err => setError(err))
            .finally(() => setLoading(false));
    }, [reload, actualUserId, navigationRequest, appServices]);

    const isInFuture = (date: string) => {
        return dayjs().diff(date, "days") <= 0;
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

    if (registrations.length === 0) return (
        <div className='text-xl'>אין שיבוצים רשומים</div>
    )

    if (currentRegistration) {
        const currentFamily = {
            city: currentRegistration.city,
            districtBaseFamilyId: currentRegistration.districtBaseFamilyId,
            familyLastName: currentRegistration.familyLastName,
            district: currentRegistration.district,
            active: currentRegistration.isFamilyActive,

        } as FamilyCompact;
        return <FamilyDetailsComponent 
            analyticComponent="ExistingRegistration"
            detailsOnly={true} familyDemandId={currentRegistration.id} date={currentRegistration.date}
            districtBaseFamilyId={currentRegistration.districtBaseFamilyId} family={currentFamily} onClose={() => {
                setCurrentRegistration(undefined)
                appServices.popNavigationStep();
            }}
            appServices={appServices} demands={registrations} reloadOpenDemands={() => { }} includeContacts={true} />
    }

    if (showCancellationDialog) {
        return <RegistrationCancellation
            userInfo={userInfo}
            onClose={() => setShowCancellationDialog(null)}
            onCancellationPerformed={() => {
                setShowCancellationDialog(null);
                appServices.showMessage("success", "ביטול נקלט", "");
                setCurrentRegistration(undefined);
                appServices.popNavigationStep();
                setReload(prev => prev + 1);
            }}
            onError={(err) => appServices.showMessage("error", "ביטול רישום נכשל", err.message)}
            registration={showCancellationDialog}
        />;
    }

    const registrationsToShow = registrations?.filter(r => filter === Filters.ALL || (filter === Filters.FUTURE && isInFuture(r.date)));
    return (
        <div>
            <div className='flex flex-row justify-content-center relative'>
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
                                hideIcon={true}
                                title={reg.familyLastName}
                                body={`עיר: ${reg.city}\nמתי: ${getReferenceDays(reg.date)}`}
                                footer={dayjs(reg.date).format(NICE_DATE)}
                                unread={isInFuture(reg.date)}
                                onRead={() => {
                                    setCurrentRegistration(reg);
                                    appServices.pushNavigationStep("family-details-existing-reg", () => setCurrentRegistration(undefined));
                                }}
                                onDelete={dayjs(reg.date).isBefore(dayjs()) ?
                                    undefined : // only allow deleting future commitments
                                    () => {
                                        setShowCancellationDialog(reg)
                                        appServices.pushNavigationStep("cancel-reg", () => setCurrentRegistration(undefined));
                                    }}
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

