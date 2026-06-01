
export const generate = () => {
    const MAX_LENGTH = 7;
    const set = "0123456789abcdefghijklmnopqrstuvwxz";
    let id = "";
    for (let i = 0 ; i < MAX_LENGTH ; i++) {
        id += set[Math.floor(Math.random() * set.length)]
    }
    return id ;
}

export const fetchProjectName = (url: string) => {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const name: string = pathParts[pathParts.length - 1] ?? "";
    return name;
}