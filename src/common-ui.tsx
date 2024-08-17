import { ProgressBar } from "primereact/progressbar";

export function InProgress() {
    return <ProgressBar mode="indeterminate" style={{ height: '6px' }}></ProgressBar>;
}