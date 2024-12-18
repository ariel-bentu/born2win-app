import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getUserRegistrations, getVolunteerInfo } from './api';
import { SelectButton } from 'primereact/selectbutton';
import { AppServices, FamilyCompact, FamilyDemand, NavigationStep, Status, UserInfo, VolunteerInfo, VolunteerType } from './types';
import { FaUtensils, FaTruck } from 'react-icons/fa'; // Import cooking and transporting icons
import { GiCookingPot, GiPartyHat } from 'react-icons/gi';

import { InProgress } from './common-ui';
import OneLine from './one-line';
import RegistrationCancellation from './registration-cancellation';
import { DATE_AT, getReferenceDays, NICE_DATE, sortByDateDesc } from './utils';
import { FamilyDetailsComponent } from './family-registration-details';

const Filters = {
    ALL: 2,
    FUTURE: 1,
    array: [
        { name: 'עתידי', value: 1 },
        { name: 'מתחילת החודש', value: 2 },
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
    const [volunteerInfo, setVolunteerInfo] = useState<VolunteerInfo | undefined>();


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
            // Fetch volunteer info if a valid registration is selected
            if (regs.length > 0 && regs[0].volunteerId) {
                getVolunteerInfo(regs[0].volunteerId).then(info => {
                    setVolunteerInfo(info);
                }).catch(err => {
                    console.error("Failed to fetch volunteer info:", err);
                });
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
        <div className='text-xl'>אין התנדבויות רשומות</div>
    )

    if (currentRegistration) {
        const currentFamily = {
            city: currentRegistration.familyCityName,
            districtBaseFamilyId: currentRegistration.districtBaseFamilyId,
            mainBaseFamilyId: currentRegistration.mainBaseFamilyId,
            familyLastName: currentRegistration.familyLastName,
            district: currentRegistration.district,
            active: currentRegistration.isFamilyActive,

        } as FamilyCompact;
        return <FamilyDetailsComponent
            type={VolunteerType.Any}
            analyticComponent="ExistingRegistration"
            detailsOnly={true} familyDemandId={currentRegistration.id} date={currentRegistration.date}
            mainBaseFamilyId={currentRegistration.mainBaseFamilyId} family={currentFamily} onClose={() => {
                setCurrentRegistration(undefined)
                appServices.popNavigationStep();
            }}
            appServices={appServices} demands={registrations} reloadOpenDemands={async () => { }} includeContacts={true} actualUserId={actualUserId} />
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

    const now = dayjs().format(DATE_AT);
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
            <div className="surface-ground md:px-4 lg:px-6">
                <div className="w-full">
                    {registrationsToShow?.length ? (
                        registrationsToShow.flatMap((reg) => {
                            let stamp = undefined;
                            if (dayjs(reg.date).isBefore(now, "day")) {
                                stamp = "עבר";
                            }
                            if (reg.status == Status.Cancelled) {
                                stamp = stamp != undefined ? stamp + ",בוטל" :"בוטל";
                            }

                            const lines = [];
                            // Cooking line (if volunteerId is present and current user is the volunteer)
                            if (reg.volunteerId === actualUserId) {
                                lines.push(
                                    <OneLine
                                        key={`cooking-${reg.id}`}
                                        icon={
                                            <div>
                                                {reg.type == VolunteerType.Meal ?
                                                    <div className='flex flex-column align-items-center'>
                                                        <GiCookingPot style={{ fontSize: '2.5rem' }} />
                                                        <span>בישול</span>
                                                    </div> :
                                                    <div className='flex flex-column align-items-center'>
                                                        <GiPartyHat style={{ fontSize: '2.5rem' }} />
                                                        <span>פינוקי חג</span>
                                                    </div>
                                                }


                                            </div>
                                        }
                                        title={reg.familyLastName}
                                        body={`עיר: ${reg.familyCityName}\nמתי: ${getReferenceDays(reg.date)}`}
                                        footer={dayjs(reg.date).format(NICE_DATE)}
                                        unread={isInFuture(reg.date)}
                                        className="cooking-color" // Apply specific color for cooking
                                        onRead={() => {
                                            setCurrentRegistration(reg);
                                            appServices.pushNavigationStep("family-details-existing-reg", () => setCurrentRegistration(undefined));
                                        }}
                                        onDelete={
                                            dayjs(reg.date).isBefore(dayjs()) || reg.status == Status.Cancelled
                                                ? undefined
                                                : () => {
                                                    setShowCancellationDialog(reg);
                                                    appServices.pushNavigationStep("cancel-reg", () => setCurrentRegistration(undefined));
                                                }
                                        }
                                        deleteLabel={"ביטול שיבוץ"}
                                        stamp={stamp}
                                    />
                                );
                            }
                            const cookingVolunteerCity = volunteerInfo ? volunteerInfo.city : ""; // Assuming volunteerInfo has the city of the cooking volunteer
                            const transportingDestinationCity = reg.familyCityName; // Assuming reg.city is the target city for transportation

                            // Transporting line (if transpotingVolunteerId is present and current user is the transporting volunteer)
                            if (reg.transpotingVolunteerId === actualUserId) {
                                lines.push(
                                    <OneLine
                                        key={`transport-${reg.id}`}
                                        icon={
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    backgroundColor: 'inherit',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '0.5rem',
                                                    gap: '0.5rem', // Space between icon and text
                                                    flexDirection: 'row-reverse', // Ensures text is on the right of the icon in RTL
                                                    marginLeft: '1cm', // Moves both icon and text to the right
                                                }}
                                            >
                                                <FaTruck style={{ fontSize: '2.5rem' }} />
                                                <span>שינוע</span>
                                            </div>
                                        }
                                        title={reg.familyLastName}
                                        body={`מעיר: ${cookingVolunteerCity}\n לעיר: ${transportingDestinationCity}\nמתי: ${getReferenceDays(reg.date)}`}
                                        footer={dayjs(reg.date).format(NICE_DATE)}
                                        unread={isInFuture(reg.date)}
                                        className="transporting-color"
                                        onRead={() => {
                                            setCurrentRegistration(reg);
                                            appServices.pushNavigationStep("family-details-existing-reg", () => {
                                                setCurrentRegistration(undefined);
                                            });
                                        }}
                                        stamp={stamp}
                                    />
                                );
                            }
                            return lines;
                        })
                    ) : (
                        <div className='no-messages'>אין רישומים</div>
                    )}
                </div>
            </div>
        </div >
    );
};

