import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";

interface PhoneRegistrationProps {
    phoneInput: string | undefined;
    setPhoneInput: (newValue: string) => void;
    verificationCodeInput: string | undefined;
    setVerificationCodeInput: (newValue: string) => void;
    phase: "phone" | "code";
    onSubmit: () => void;
}

export default function PhoneRegistration({ phase, phoneInput, setPhoneInput, verificationCodeInput,
    setVerificationCodeInput, onSubmit }: PhoneRegistrationProps) {

    const readyToSubmit = phase == "phone" ?
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
            {phase == "phone" ?
                <>
                    <div className="m-4 text-xl">נא להזין את מספר הטלפון הסלולרי, כולל קידומת</div>
                    <InputText autoFocus onKeyDown={handleKeyDownOnlyDigits}  maxLength={10} className="text-center text-3xl" onChange={(e)=>setPhoneInput(e.currentTarget.value)} value={phoneInput || ""}></InputText>
                </> :
                <>
                    <div className="m-2">קוד שנשלח אליך בווטסאפ</div>
                    <InputText onKeyDown={handleKeyDownOnlyDigits} maxLength={4} className="text-center" onChange={(e) => setVerificationCodeInput(e.currentTarget.value)} value={verificationCodeInput || ""}></InputText>
                </>
            }
            <Button disabled={!readyToSubmit} className="m-3" label="שלח" onClick={onSubmit} />
        </div>
    </div>
}