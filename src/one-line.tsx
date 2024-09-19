import { Button } from 'primereact/button';
import birthdayMale from './media/birthday-male.jpeg';
import birthdayFemale from './media/birthday-female.jpeg';

interface LineButton {
    label: string;
    action: string;
    params: string[];
}

interface OneLineProps {
    title: string;
    body: string;
    unread: boolean;
    footer?: string;
    onDelete?: (event: any) => void;
    onRead: () => void;
    deleteLabel?: string;
    buttons?: LineButton[];
    onLineButtonPressed?: (action: string, params: string[]) => void;
    hideIcon?: boolean;
}

export default function OneLine({ title, body, unread, footer, onDelete, onRead, deleteLabel,
    buttons, onLineButtonPressed, hideIcon }: OneLineProps) {

    const handleCopyLink = (link: string) => {
        navigator.clipboard.writeText(link);
    };


    const IMAGE_PREFIX = "IMAGE:";
    const renderMessagePart = (part: string, index: number) => {
        if (part.startsWith(IMAGE_PREFIX)) {
            const imageName = part.substring(IMAGE_PREFIX.length);
            let imageSrc;
            switch (imageName) {
                case "birthday-male":
                    imageSrc = birthdayMale;
                    break;
                case "birthday-female":
                    imageSrc = birthdayFemale;
                    break;
            }
            if (imageSrc) {
                return <img src={imageSrc} style={{width:"95%"}}/>
            }
            return <div>תמונה לא מוכרת - {imageName}</div>
        }

        const colonIndex = part.indexOf(':');

        if (colonIndex !== -1) {
            const value = part.slice(colonIndex + 1).trim();
            const isLink = value.startsWith('http://') || value.startsWith('https://');
            const label = part.slice(0, colonIndex + (isLink ? 0 : 1));
            return (
                <div className="flex align-items-center" key={index}>
                    {isLink ? <>
                        <a href={value} target="_blank" rel="noopener noreferrer" className='ml-2'>
                            {label}
                        </a>
                        <Button icon="pi pi-copy" label="העתק" className="p-button-text p-button-rounded" onClick={() => handleCopyLink(value)} style={{ marginLeft: '0.5rem' }} />
                    </> :
                        <>
                            <strong className="pl-1">{label}</strong> <div>{value}</div>
                        </>}
                </div>
            );
        }

        return <div key={index}>{part}</div>;
    };

    return (
        <div className="flex flex-row m-2 w-11" >
            <div className="surface-card shadow-2 p-3 border-round-xl w-12" onClick={onRead} >
                <div className="flex justify-content-between mb-3 relative" >
                    <div className="flex flex-column w-12">
                        <div className={`text-right  text-xl font-xlarge mb-3 ${unread ? 'font-bold' : ''}`}>
                            {title}
                        </div>
                        <div className="w-12 text-900 font-medium text-lg">
                            {body.split('\n').map(renderMessagePart)}
                        </div>
                    </div>
                    {unread && <div className='red-dot' />}
                    {!hideIcon && <div className="flex relative align-items-center justify-content-center bg-purple-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                        <i className="pi pi-comment text-purple-500 text-xl"></i>

                    </div>}
                </div>

                {buttons?.length && onLineButtonPressed &&
                    <div className="flex flex-row align-items-end justify-content-start">
                        {buttons.map((btn, i) => (<Button className="ml-3" key={i} label={btn.label} onClick={() => {
                            onLineButtonPressed(btn.action, btn.params);
                        }} />))}
                    </div>}
                <div className="flex flex-row align-items-end justify-content-between">
                    {footer && <span className="text-700 text-black-alpha-80">{footer}</span>}
                    {onDelete && <div className="flex justify-content-end mt-3">
                        <Button unstyled label={deleteLabel} icon="pi pi-trash" className={"icon-btn " + (deleteLabel ? "icon-btn-withLabel" : "")} onClick={(e) => {
                            e.stopPropagation();
                            onDelete(e);
                        }} />
                    </div>}
                </div>
            </div>
        </div>
    );
};

