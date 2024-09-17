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
    loaded: boolean;
}

export const Gallery: React.FC<GalleryProps> = ({ storagePath, userInfo, appServices }) => {
    const storage = getStorage();
    const [folders, setFolders] = useState<Folder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState<string>('');
    const [newFileName, setNewFileName] = useState<string | undefined>();
    const [busy, setBusy] = useState<boolean>(false);
    const [reload, setReload] = useState<number>(0);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [folderInputVisible, setFolderInputVisible] = useState<boolean>(false);
    const [uploadDialogVisible, setUploadDialogVisible] = useState<boolean>(false);
    const [fileFolderEditVisible, setFileFolderEditVisible] = useState<boolean>(false);

    const itemTemplate = (item: ImageItem) => {
        if (!item) return null;
        return <div>
            <div className='absolute w-12 text-center  text-black font-bold' style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>{getFileNameWithoutExtension(item.name)}</div>
            <img src={item.url} alt={getFileNameWithoutExtension(item.name)} style={{ width: '100%', display: 'block' }} />
        </div>;
    };

    const thumbnailTemplate = (item: ImageItem) => {
        if (!item) return null;
        return <img src={item.url} alt={item.name} style={{ width: 70, display: 'block' }} />;
    };
    useEffect(() => {
        const loadFolders = async () => {
            const path = `${storagePath}`;
            const rootRef = ref(storage, path);
            setBusy(true);
            const { prefixes } = await listAll(rootRef);
            const initialFolders: Folder[] = prefixes.map((prefix) => ({
                name: prefix.name,
                items: [],
                loaded: false, // Initially set to false (not loaded)
            }));
            setFolders(initialFolders);
            if (initialFolders.length > 0) {
                handleFolderClick(initialFolders, initialFolders[0].name);
            }
            setBusy(false);
        };

        loadFolders();
    }, [reload]);

    // Function to load the folder's content lazily
    const handleFolderClick = async (_folders: Folder[], folderName: string) => {
        const folderIndex = _folders.findIndex(f => f.name === folderName);
        if (folderIndex < 0) return;
        const selectedFolder = _folders[folderIndex];

        // If folder is already loaded, just set it as current
        if (selectedFolder.loaded) {
            setCurrentFolder(selectedFolder.name);
            setActiveIndex(0);
            return;
        }

        // If folder is not loaded, load its content
        const folderRef = ref(storage, `${storagePath}/${folderName}`);
        setBusy(true);
        const results = await listAll(folderRef);
        const loadedItems: ImageItem[] = [];

        for (let j = 0; j < results.items.length; j++) {
            if (results.items[j].name !== "placeholder.txt") {
                const url = await getDownloadURL(results.items[j]);
                loadedItems.push({ name: results.items[j].name, url });
            }
        }

        // Update the folder with loaded items
        const updatedFolders = [..._folders];
        updatedFolders[folderIndex] = {
            ...selectedFolder,
            items: loadedItems,
            loaded: true // Mark as loaded
        };
        setFolders(updatedFolders);
        setCurrentFolder(selectedFolder.name);
        setActiveIndex(0);
        setBusy(false);
    }

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

    const deleteFolder = async (folderPath: string) => {
        const folderRef = ref(storage, folderPath);

        try {
            // List all the items (files) in the folder
            const listResults = await listAll(folderRef);

            // Delete each file in the folder
            const deletePromises = listResults.items.map((fileRef) => deleteObject(fileRef));
            await Promise.all(deletePromises);

            console.log("Folder contents deleted successfully");
        } catch (error) {
            console.error("Error deleting folder contents: ", error);
        }
    };

    const handleDeleteFolder = useCallback(() => {
        if (!currentFolder) return;
        const folderObj = folders.find(f => f.name === currentFolder)
        if (!folderObj) return;
        confirmPopup({
            message: `האם למחוק תיקיה '${folderObj.name}' וכל התמונות שבתוכה?`,
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                await deleteFolder(`${storagePath}/${currentFolder}`);
                appServices.showMessage('success', 'תיקיה נמחקה בהצלחה', '')
                setReload(prev => prev + 1)
            }
        });
    }, [folders, currentFolder])

    const handleRenameFolder = useCallback(async () => {
        if (!currentFolder || !newFolderName) return;
        const folderObj = folders.find(f => f.name === currentFolder);
        if (!folderObj) return;

        confirmPopup({
            message: `האם לשנות שם לתיקיה '${folderObj.name}' ל-'${newFolderName}'?`,
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                try {
                    setBusy(true);
                    const oldFolderRef = ref(storage, `${storagePath}/${currentFolder}`);

                    // List all files in the folder
                    const results = await listAll(oldFolderRef);

                    // Copy each file to the new folder
                    for (let i = 0; i < results.items.length; i++) {
                        const file = results.items[i];
                        const fileRef = ref(storage, `${storagePath}/${newFolderName}/${file.name}`);
                        const fileURL = await getDownloadURL(file);
                        const fileBlob = await fetch(fileURL).then(r => r.blob())
                        // Upload to new folder
                        await uploadBytes(fileRef, fileBlob);
                    }

                    // Once copied, delete the old folder
                    await deleteFolder(`${storagePath}/${currentFolder}`);

                    setBusy(false);
                    appServices.showMessage('success', 'תיקיה שונתה בהצלחה', '');
                    setReload(prev => prev + 1);
                } catch (err) {
                    console.log(err);
                } finally {
                    setBusy(false);
                }
            }
        });
    }, [folders, currentFolder, newFolderName]);

    const handleRenameImage = useCallback(async () => {
        if (!currentFolder || activeIndex === null || !newFileName) return;
        const folderObj = folders.find(f => f.name === currentFolder);
        if (!folderObj || !folderObj.items[activeIndex]) return;

        const imageToRename = folderObj.items[activeIndex];
        const oldImageRef = ref(storage, `${storagePath}/${currentFolder}/${imageToRename.name}`);
        const newImageRef = ref(storage, `${storagePath}/${currentFolder}/${newFileName}.jpeg`);

        const fileURL = await getDownloadURL(oldImageRef);
        const fileBlob = await fetch(fileURL).then(r => r.blob());

        // Upload the file with the new name
        await uploadBytes(newImageRef, fileBlob);

        // Delete the old image
        await deleteObject(oldImageRef);

        appServices.showMessage('success', 'תמונה שונתה בהצלחה', '');
        setReload(prev => prev + 1);
    }, [folders, currentFolder, activeIndex, newFileName]);


    const handleUpload = useCallback(async (event: any) => {
        if (!newFileName) return;
        const illegalCharacters = /[\\/:*?"<>|]/g;  // Add any other illegal characters if necessary

        // Validate the new file name
        if (illegalCharacters.test(newFileName)) {
            appServices.showMessage("warn", 'שגיאה', 'שם הקובץ מכיל תווים שאינם חוקיים. נא להשתמש בתווים תקינים.');
            return;
        }

        if (!newFileName || newFileName.trim() === "") {
            appServices.showMessage("warn", 'שגיאה', 'שם הקובץ לא יכול להיות ריק.');
            return;
        }

        const file = event.files[0];
        const fileRef = ref(storage, `${storagePath}/${currentFolder || ''}/${newFileName}.jpeg`);
        await uploadBytes(fileRef, file);
        appServices.showMessage('success', ',תמונה עלתה בהצלחה', '')

        setUploadDialogVisible(false);
        setReload(prev => prev + 1)
    }, [currentFolder, newFileName]);

    const handleCreateFolder = useCallback(async () => {
        if (!newFolderName) return;
        const folderRef = ref(storage, `${storagePath}/${newFolderName}/placeholder.txt`);
        setBusy(true);
        await uploadBytes(folderRef, new Blob(["placeholder"])).then(() => {
            setReload(prev => prev + 1);
            setFolderInputVisible(false);
        }).finally(() => setBusy(false));

        setReload(prev => prev + 1);
        setNewFolderName('');
    }, [newFolderName]);

    console.log("gallery folders", folders)

    const currFolder = folders.find(f => f.name == currentFolder);

    return (
        <div className='flex flex-column relative justify-content-center align-items-center w-12 overflow-x-hidden'>
            {busy && <InProgress />}
            <div className='flex flex-column align-items-center relative'>
                {userInfo?.isAdmin && <div className="flex flex-row" >
                    <Button unstyled icon="pi pi-upload" onClick={() => {
                        setNewFileName("");
                        setUploadDialogVisible(true)
                    }} className="icon-btn-l mr-2" />
                    <Button unstyled icon="pi pi-folder-plus" onClick={() => setFolderInputVisible(true)} className="icon-btn-l" />
                    <Button unstyled icon="pi pi-file-edit" onClick={() => {
                        setNewFolderName(currFolder?.name || "");
                        if (currFolder && currFolder.items.length) {
                            setNewFileName(getFileNameWithoutExtension(currFolder?.items[activeIndex].name));
                        } else {
                            setNewFileName(undefined);
                        }
                        setFileFolderEditVisible(true)
                    }
                    } className="icon-btn-l" />
                </div>}<SelectButton
                    pt={{ root: { className: "select-button-container" } }}
                    unstyled
                    value={currentFolder} onChange={(e) => {
                        if (e.value) {
                            handleFolderClick(folders, e.value); // Load folder content lazily
                        }
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

            <Dialog style={{ direction: "rtl" }} visible={uploadDialogVisible} onHide={() => setUploadDialogVisible(false)} header="העלאת תמונה" >
                <InputText placeholder='שם/כותרת' className='w-12' value={newFileName} onChange={(e) => setNewFileName(e.target.value)} />
                <FileUpload name="image" accept="image/*" maxFileSize={1000000} customUpload uploadHandler={handleUpload} />
            </Dialog>

            <Dialog style={{ direction: "rtl", width: '70vw' }} header="שם תיקיה" visible={folderInputVisible} onHide={() => setFolderInputVisible(false)}>
                <div className="p-field">
                    <InputText value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    <Button label="צור תיקיה" onClick={handleCreateFolder} />
                </div>
            </Dialog>

            <Dialog style={{ direction: "rtl", width: '80vw' }} header="עריכת קובץ ותיקיה" visible={fileFolderEditVisible} onHide={() => setFileFolderEditVisible(false)}>
                <div className="p-field">
                    <div className="text-xl">שם התיקיה</div>
                    <InputText value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    <div className='flex flex-row mt-3 mb-5'>
                        <Button label="שמור שם חדש לתיקיה" onClick={() => {
                            handleRenameFolder()
                            setFileFolderEditVisible(false);
                        }} />
                        <Button label="מחק תיקיה" onClick={() => {
                            handleDeleteFolder()
                            setFileFolderEditVisible(false);
                        }} />
                    </div>
                </div>
                {newFileName && <div className="p-field">
                    <div className="text-xl">שם התמונה</div>
                    <InputText value={newFileName} onChange={(e) => setNewFileName(e.target.value)} />
                    <div className='flex flex-row mt-3'>
                        <Button label="שמור שם חדש לתמונה" onClick={() => {
                            handleRenameImage();
                            setFileFolderEditVisible(false);
                        }} />
                        <Button label="מחק תמונה" onClick={() => {
                            handleDeleteImage(activeIndex)
                            setFileFolderEditVisible(false);
                        }} />
                    </div>
                </div>}
            </Dialog>
        </div>
    );
};

const getFileNameWithoutExtension = (fileName: string | undefined): string => {
    if (!fileName) return "";

    return fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
};