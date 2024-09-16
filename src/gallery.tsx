import React, { useCallback, useEffect, useState } from 'react';
import { getStorage, ref, listAll, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { FileUpload } from 'primereact/fileupload';
import { AppServices, UserInfo } from './types';
import { Galleria } from 'primereact/galleria';
import { SelectButton } from 'primereact/selectbutton';
import { InputText } from 'primereact/inputtext';
import { InProgress } from './common-ui';
import { confirmPopup } from 'primereact/confirmpopup';
import { ProgressBar } from 'primereact/progressbar';


interface GalleryProps {
    userInfo: UserInfo | null;
    storagePath: string;
    appServices: AppServices;
}

interface ImageItem {
    name: string;
    url: string;
}

interface Folder {
    name: string;
    items: ImageItem[];
}

export const Gallery: React.FC<GalleryProps> = ({ storagePath, userInfo, appServices }) => {
    const storage = getStorage();
    const [folders, setFolders] = useState<Folder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [uploadDialogVisible, setUploadDialogVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [folderInputVisible, setFolderInputVisible] = useState<boolean>(false);
    const [busy, setBusy] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [activeIndex, setActiveIndex] = useState<number>(0);

    const itemTemplate = (item: any) => {
        if (!item) return null;
        return <img src={item.url} alt={item.name} style={{ width: '100%', display: 'block' }} />;
    };

    const thumbnailTemplate = (item: any) => {
        if (!item) return null;
        return <img src={item.url} alt={item.name} style={{ width: 70, display: 'block' }} />;
    };

    // const indicatorTemplate = (index: number) => {
    //     return <span style={{ color: '#ffffff', cursor: 'pointer' }}>{index + 1}</span>;
    // };

    useEffect(() => {
        console.log("load folder/folders", currentFolder)
        const path = `${storagePath}`;
        const rootRef = ref(storage, path);
        setBusy(true);
        listAll(rootRef).then(async ({ prefixes }) => {
            const _folders: Folder[] = [];
            for (let i = 0; i < prefixes.length; i++) {
                const folderName = prefixes[i].name;
                const folderRef = ref(storage, `${path}/${folderName}`);
                const results = await listAll(folderRef);
                const folderObj: Folder = { name: folderName, items: [] };
                for (let j = 0; j < results.items.length; j++) {
                    if (results.items[j].name !== "placeholder.txt") {
                        const url = await getDownloadURL(results.items[j]);
                        folderObj.items.push({ name: results.items[j].name, url });
                    }
                }
                _folders.push(folderObj);
            }
            setFolders(_folders);
            if (_folders.length) {
                setCurrentFolder(_folders[0].name);
            }
            setBusy(false);
        });

    }, [reload])

    const handleDeleteImage = useCallback((index: number) => {

        if (!currentFolder) return;
        const folderObj = folders.find(f => f.name === currentFolder)
        if (!folderObj) return;
        confirmPopup({
            message: `האם למחוק תמונה -  ${folderObj.items[index].name}?`,
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                const imageRef = ref(storage, `${storagePath}/${currentFolder}/${folderObj.items[index].name}`);
                await deleteObject(imageRef);
                appServices.showMessage('success', ',תמונה נמחקה בהצלחה', '')
                setActiveIndex(0);
                setReload(prev => prev + 1)
            }
        });
    }, [folders, currentFolder])

    const handleUpload = async (event: any) => {
        const file = event.files[0];
        const fileRef = ref(storage, `${storagePath}/${currentFolder || ''}/${file.name}`);
        await uploadBytes(fileRef, file);
        appServices.showMessage('success', ',תמונה עלתה בהצלחה', '')

        setUploadDialogVisible(false);
        setReload(prev => prev + 1)
    };

    const handleCreateFolder = async () => {
        if (!newFolderName) return;
        const folderRef = ref(storage, `${storagePath}/${newFolderName}/placeholder.txt`);
        setBusy(true);
        await uploadBytes(folderRef, new Blob(["placeholder"])).then(() => {
            setReload(prev => prev + 1);
            setFolderInputVisible(false);
        }).finally(() => setBusy(false));

        setReload(prev => prev + 1);
        setNewFolderName('');
    };

    console.log("gallery folders", folders)

    const currFolder = folders.find(f => f.name == currentFolder);

    return (
        <div className='flex flex-column relative justify-content-center align-items-center w-12'>
            {busy && <InProgress />}
            <div className='flex flex-column align-items-center relative'>
                {userInfo?.isAdmin && <div className="flex flex-row" >
                    <Button unstyled icon="pi pi-upload" onClick={() => setUploadDialogVisible(true)} className="icon-btn-l mr-2" />
                    <Button unstyled icon="pi pi-folder-plus" onClick={() => setFolderInputVisible(true)} className="icon-btn-l" />
                    <Button unstyled disabled={!currFolder || currFolder.items.length === 0} icon="pi pi-trash" onClick={() => handleDeleteImage(activeIndex)} className="icon-btn-l" />
                </div>}<SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={currentFolder} onChange={(e) => {
                        e.value && setCurrentFolder(e.value);
                        setActiveIndex(0);
                    }}
                    optionLabel="name" options={folders.map(f => f.name)}
                    itemTemplate={(option) => (
                        <div className={`select-button-item ${currentFolder === option ? 'p-highlight' : ''}`}>
                            {option}
                        </div>
                    )}
                />

            </div>


            {currentFolder && (
                <div dir='ltr'>

                    {currFolder && currFolder.items.length ? <Galleria
                        value={currFolder.items}
                        className='mt-2'
                        showThumbnails={true}
                        thumbnail={thumbnailTemplate}
                        thumbnailsPosition="top"
                        numVisible={4}
                        changeItemOnIndicatorHover
                        showIndicatorsOnItem
                        indicatorsPosition="top"
                        item={itemTemplate}
                        activeIndex={activeIndex}
                        onItemChange={(e) => {
                            setActiveIndex(e.index)
                        }}
                    /> : <div className='text-xl mt-5'>אין עדיין תמונות</div>}

                </div>
            )}

            <Dialog visible={uploadDialogVisible} onHide={() => setUploadDialogVisible(false)} header="Upload Image">
                <FileUpload name="image" accept="image/*" maxFileSize={1000000} customUpload uploadHandler={handleUpload} />
            </Dialog>

            <Dialog header="שם תיקיה" visible={folderInputVisible} style={{ width: '50vw' }} onHide={() => setFolderInputVisible(false)}>
                <div className="p-field">
                    <InputText id="inputText" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    <Button label="צור תיקיה" onClick={handleCreateFolder} />
                </div>
            </Dialog>
        </div>
    );
};