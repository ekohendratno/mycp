// API wrapper layer for control panel
// Setiap fungsi di‑export di sini hanyalah delegasi ke fungsi global yang
// sudah ada di aplikasi (mis. getSite, readFile, dll.).
// Dengan cara ini UI dapat di‑import secara modul‑bersih dan mudah di‑mock.
export const getSite = (domain) => window.getSite?.(domain);
export const getDatabases = (domain) => window.getDatabases?.(domain);
export const getCronJobs = (domain) => window.getCronJobs?.(domain);
export const getFtpAccounts = (domain) => window.getFtpAccounts?.(domain);
export const getFileList = (domain, path) => window.getFileList?.(domain, path);
export const readFile = (domain, path) => window.readFile?.(domain, path);
export const writeFile = (domain, path, content) => window.writeFile?.(domain, path, content);
export const compressFile = (domain, path) => window.compressFile?.(domain, path);
export const copyFile = (domain, src, dest) => window.copyFile?.(domain, src, dest);
export const moveFile = (domain, src, dest) => window.moveFile?.(domain, src, dest);
export const renameFile = (domain, path, newName) => window.renameFile?.(domain, path, newName);
export const deleteFile = (domain, path) => window.deleteFile?.(domain, path);
export const updateSite = (domain, data) => window.updateSite?.(domain, data);
export const createDatabase = (domain, payload) => window.createDatabase?.(domain, payload);
export const deleteDatabase = (domain, id) => window.deleteDatabase?.(domain, id);
export const createCronJob = (domain, payload) => window.createCronJob?.(domain, payload);
export const deleteDb = async (id) => window.deleteDb?.(id);
export const createFolder = (domain, path) => window.createFolder?.(domain, path);
export const issueSsl = (domain) => window.issueSsl?.(domain);
export const getVhost = (domain) => window.getVhost?.(domain);
export const saveVhost = (domain, content) => window.saveVhost?.(domain, content);
export const fetchPhpini = (domain) => window.fetchPhpini?.(domain);
export const changePassword = (domain, pwd) => window.changePassword?.(domain, pwd);
export const deleteSite = (domain) => window.deleteSite?.(domain);
