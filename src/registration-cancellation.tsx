import { useState } from "react";
import { Card } from "primereact/card";
import { InputTextarea } from "primereact/inputtextarea";
import { Button } from "primereact/button";
import { updateFamilityDemand } from "./api";
import { FamilyDemand } from "./types";
import { InProgress } from "./common-ui";

interface RegistrationCancellationProps {
    onClose: () => void;
    onError: (err: Error) => void;
    onCancellationPerformed: () => void;
    registration: FamilyDemand;
}

export default function RegistrationCancellation({ onClose, onCancellationPerformed, registration, onError }: RegistrationCancellationProps) {
    const [reason, setReason] = useState<string>("");
    const [isReasonValid, setIsReasonValid] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);

    const handleReasonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setReason(value);
        setIsReasonValid(value.trim().length > 0);
    };

    return (
        <div className="relative p-grid p-justify-center p-align-center" style={{ minHeight: '100vh' }}>
            <Button label="סגור" icon="pi pi-times" onClick={onClose} className="mt-3" style={{ position: "absolute", left: 20, top: 0 }} />

            <div className="p-col-12 p-md-6">
                <Card title="ביטול רישום" className="p-shadow-3">
                    <div className="p-grid p-dir-col p-align-center">
                        <div className="p-col-12 p-text-center">
                            <p><strong>תאריך:</strong> {registration.date}</p>
                            <p><strong>שם המשפחה:</strong> {registration.familyLastName}</p>
                        </div>
                        <div className="p-col-12 p-text-center">
                            <p>האם אתה בטוח שברצונך לבטל את הרישום?</p>
                        </div>
                        <div className="p-col-12">
                            <InputTextarea
                                autoFocus
                                value={reason}
                                onChange={handleReasonChange}
                                rows={3}
                                placeholder="סיבת הביטול (שדה חובה)"
                                className="p-inputtext-lg"
                                required
                            />
                        </div>
                        <div className="p-col-12 p-d-flex p-jc-center p-mt-4">
                            <Button
                                label="ביטול הרישום לבישול"
                                icon="pi pi-check"
                                className="p-button-danger p-mr-2"
                                onClick={() => {
                                    setSaving(true);
                                    updateFamilityDemand(registration.id, registration.familyId, "cityId(unknown)", false, reason)
                                        .then(onCancellationPerformed)
                                        .catch(onError)
                                        .finally(() => setSaving(false));
                                }}

                                disabled={!isReasonValid || saving}
                            />
                        </div>
                        {saving && <InProgress />}
                    </div>
                </Card>
            </div>
        </div>
    );
};