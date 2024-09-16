import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useCallback, useState } from "react";
import { AppServices } from "./types";
import { updateLoginInfo } from "./api";
import { InProgress } from "./common-ui";
import { isIOS } from "./App";

interface PhoneRegistrationProps {
    onPhoneRegistrationComplete: (vid: string) => void;
    appServices: AppServices;
}

export default function PhoneRegistration({ appServices, onPhoneRegistrationComplete }: PhoneRegistrationProps) {
    const [phoneInput, setPhoneInput] = useState<string>("");
    const [verificationCodeInput, setVerificationCodeInput] = useState<string>("");
    const [phonePhase, setPhonePhase] = useState<"phone" | "code">("phone");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | undefined>();


    const handlePhoneFlowSubmit = useCallback(() => {
        setError(undefined);
        if (phonePhase == "phone") {
            // todo validate phone
            setLoading(true);
            updateLoginInfo(undefined, undefined, undefined, phoneInput, isIOS).then(() => {
                setPhonePhase("code");
                setVerificationCodeInput("");
                appServices.showMessage("success", "בקשתך התקבלה - תיכף תתקבל באמצעות ווטסאפ הודעה עם קוד אישור - עליך להקליד אותו ", "");
            }).catch((err: Error) => {
                setError("תקלת הזדהות באמצעות טלפון. (" + err.message + ")");
                console.log("Failed to start phone flow", err);
            }).finally(() => setLoading(false));
        } else {
            console.log("Sending verification code", phoneInput, verificationCodeInput);
            setLoading(true);
            updateLoginInfo(undefined, verificationCodeInput, undefined, phoneInput, isIOS).then((retVolId: string) => {
                onPhoneRegistrationComplete(retVolId);
                appServices.showMessage("success", "אימות הושלם בהצלחה", "");
            }).catch((err: Error) => {
                setError("תקלת הזדהות באמצעות קוד האימות. " + err.message);
                console.log("Failed to verify code in phone flow", err);
            }).finally(() => setLoading(false));
        }
    }, [phonePhase, phoneInput, verificationCodeInput]);

    const readyToSubmit = phonePhase == "phone" ?
        phoneInput && phoneInput.length == 10 && phoneInput[0] == "0" :
        true;

    const handleKeyDownOnlyDigits = (e: any) => {
        const charCode = e.which || e.keyCode;

        // Allow only digits (0-9), backspace (8), delete (46), arrow keys (37-40)
        if (
            (charCode < 48 || charCode > 57) && // Not a digit
            charCode !== 8 &&                   // Not backspace
            charCode !== 46 &&                  // Not delete
            !(charCode >= 37 && charCode <= 40) // Not an arrow key
        ) {
            e.preventDefault();
        }
    };

    return <div>
        <div dir="ltr" className="flex flex-column w-11 align-items-center ">
            {loading && <InProgress />}
            {error && <div>{error}</div>}
            {phonePhase == "phone" ?
                <>
                    <div className="m-4 text-xl">נא להזין את מספר הטלפון הסלולרי, כולל קידומת</div>
                    <InputText autoFocus onKeyDown={handleKeyDownOnlyDigits} maxLength={10}
                        keyfilter="pint"  // Use "num" for decimal numbers
                        inputMode="numeric"
                        type="text"
                        className="text-center text-3xl" onChange={(e) => setPhoneInput(e.currentTarget.value)} value={phoneInput} />
                </> :
                <>
                    <div className="m-2">קוד שנשלח אליך בווטסאפ</div>
                    <InputText onKeyDown={handleKeyDownOnlyDigits} maxLength={4}
                        keyfilter="pint"  // Use "num" for decimal numbers
                        inputMode="numeric"
                        type="text"
                        className="text-center text-3xl" onChange={(e) => setVerificationCodeInput(e.currentTarget.value)} value={verificationCodeInput} />
                </>
            }
            <Button disabled={!readyToSubmit} className="m-3" label="שלח" onClick={handlePhoneFlowSubmit} />
        </div>
    </div>
}