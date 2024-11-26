import { Button } from 'primereact/button';
import birthdayMale from './media/birthday-male.jpeg';
import birthdayFemale from './media/birthday-female.jpeg';
import { PhoneNumber } from './common-ui';

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
    icon?: React.ReactNode; // Add icon prop here
    buttons?: LineButton[];
    onLineButtonPressed?: (action: string, params: string[]) => void;
    hideIcon?: boolean;
    className?: string;
    stamp?: string;
}

export default function OneLine({
    title,
    body,
    unread,
    footer,
    onDelete,
    onRead,
    deleteLabel,
    buttons,
    onLineButtonPressed,
    hideIcon,
    icon,
    className,
    stamp
}: OneLineProps) {

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
                return <img src={imageSrc} style={{ width: "95%" }} />;
            }
            return <div>תמונה לא מוכרת - {imageName}</div>;
        }

        let phone = undefined;
        const phoneIndex = part.indexOf('tel:');
        if (phoneIndex >= 0) {
            const startIndex = phoneIndex + 4; // Move past 'tel:'
            const endIndex = part.substring(startIndex).search(/\s/);

            phone = endIndex === -1 ? part.substring(startIndex) : part.substring(startIndex, startIndex + endIndex);

            if (endIndex === -1) {
                part = part.substring(0, phoneIndex).trim();
            } else {
                part = part.substring(0, phoneIndex) + part.substring(startIndex + endIndex).trim();
            }
        }
        const colonIndex = part.indexOf(':');
        const bullet = part.startsWith("- ");
        if (phone) console.log(" extracted phone", phone);
        if (colonIndex !== -1) {
            const value = part.slice(colonIndex + 1).trim();
            const isLink = value.startsWith('http://') || value.startsWith('https://');
            const label = part.slice(0, colonIndex + (isLink ? 0 : 1));
            return (
                <div className="flex align-items-start justify-content-center" key={index}>
                    {isLink ? (
                        <>
                            <a href={value} target="_blank" rel="noopener noreferrer" className="ml-2">
                                {label}
                            </a>
                            <Button
                                icon="pi pi-copy"
                                label="העתק"
                                className="p-button-text p-button-rounded"
                                onClick={() => handleCopyLink(value)}
                                style={{ marginLeft: '0.5rem' }}
                            />
                        </>
                    ) : (
                        <div className="flex w-full justify-content-start">
                            <strong className="pl-1">{label}</strong>{' '}
                            <div className="text-right">{value}</div>
                        </div>
                    )}
                </div>
            );
        }
        if (part === "") {
            return <br />;
        }

        return (
            <div className={bullet ? "flex align-items-center" : ""} key={index}>
                <div className="flex">{part}</div>
                {phone && <PhoneNumber phone={phone} hideText={true} label="טלפון" />}
            </div>
        );
    };

    return (
        <div className={`flex flex-row m-2 w-11 ${className || ''}`}>
            <div className="surface-card shadow-2 p-3 border-round-xl w-12" onClick={onRead}>
                <div className="flex justify-content-between mb-3 relative">
                    <div className="flex flex-column w-12">
                        <div className={`text-right text-xl font-xlarge mb-3 ${unread ? 'font-bold' : ''}`}>
                            {title}
                        </div>
                        <div className="w-12 text-900 font-medium text-lg">
                            {body.split('\n').map(renderMessagePart)}
                        </div>
                    </div>
                    {stamp && <div className='one-line-cancelled'>{stamp}</div>}
                    {unread && <div className="red-dot" />}
                    {!hideIcon && (
                        <div className="flex absolute  border-round" style={{ left: -10, top: 40, width: '4rem', height: '2.5rem' }}>
                            {icon || <i className="pi pi-comment text-purple-500 text-xl"></i>}
                        </div>
                    )}
                </div>

                {buttons?.length && onLineButtonPressed && (
                    <div className="flex flex-row align-items-end justify-content-start">
                        {buttons.map((btn, i) => (
                            <Button
                                className="ml-3"
                                key={i}
                                label={btn.label}
                                onClick={() => {
                                    onLineButtonPressed(btn.action, btn.params);
                                }}
                            />
                        ))}
                    </div>
                )}
                <div className="flex flex-row align-items-end justify-content-between">
                    {footer && <span className="text-700 text-black-alpha-80">{footer}</span>}
                    {onDelete && (
                        <div className="flex justify-content-end mt-3">
                            <Button
                                unstyled
                                label={deleteLabel}
                                icon="pi pi-trash"
                                className={"icon-btn " + (deleteLabel ? "icon-btn-withLabel" : "")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(e);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};