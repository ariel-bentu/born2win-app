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
    return <div>
        <div className="flex flex-column w-11 align-items-center ">
            {phase == "phone" ?
                <>
                    <div className="m-2">נא להזין את מספר הטלפון הסלולרי, כולל קידומת</div>
                    <InputText onChange={(e) => setPhoneInput(e.currentTarget.value)} value={phoneInput || ""}></InputText>
                </> :
                <>
                    <div className="m-2">קוד שנשלח אליך בווטסאפ</div>
                    <InputText onChange={(e) => setVerificationCodeInput(e.currentTarget.value)} value={verificationCodeInput || ""}></InputText>
                </>
            }
            <Button label="שלח" onClick={onSubmit} />
        </div>
    </div>
}