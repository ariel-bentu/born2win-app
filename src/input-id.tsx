import { useCallback, useState } from "react";
import { InProgress } from "./common-ui";
import { AppServices } from "./types";
import { InputText } from "primereact/inputtext";
import { isValidIsraeliIdentificationNumber } from "./utils";
import { Button } from "primereact/button";
import { updateIdentificationNumber } from "./api";

interface InputIdentificationNumberProps {
    onUpdate: () => void;
    appServices: AppServices;
}

export function InputIdentificationNumber({ onUpdate, appServices }: InputIdentificationNumberProps) {
    const [loading, setLoading] = useState<boolean>(false);
    const [idInput, setIdInput] = useState<string>("");

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

    const handleSubmit = useCallback(() => {
        setLoading(true);
        updateIdentificationNumber(idInput)
            .then(onUpdate)
            .catch((err) => appServices.showMessage("error", "שמירה נכשלה", err.message))
            .finally(() => setLoading(false));
    }, [idInput])

    const validID = isValidIsraeliIdentificationNumber(idInput);
    return <div dir="ltr" className="flex flex-column w-11 align-items-center ">
        {loading && <InProgress />}
        <>
            <div className="m-4 text-xl">נא להזין את מספר תעודת הזהות בן 9 ספרות  - כולל סיפרת ביקורת</div>
            <InputText autoFocus onKeyDown={handleKeyDownOnlyDigits} maxLength={10}
                keyfilter="pint"  // Use "num" for decimal numbers
                inputMode="numeric"
                type="text"
                className="text-center text-3xl"
                onChange={(e) => setIdInput(e.currentTarget.value)} value={idInput} />
            <div style={{ color: validID ? "green" : "red" }}>{validID ? "תקין" : "לא תקין"}</div>
        </>
        <Button disabled={!validID} className="m-3" label="שלח" onClick={handleSubmit} />
    </div>
}