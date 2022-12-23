const API_URL: string = 'https://restcountries.com/v3.1';

type TCountry = {
    name: {
        common: string;
        official: string;
        nativeName: { msa: { official: string; common: string } };
    };
    cca3: string;
    capital: string[];
    altSpellings: string[];
    borders: string[];
};

async function getData(url: string): Promise<any> {
    // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
    const response: Response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        redirect: 'follow',
    });
    return response.json();
}

async function loadCountriesData() {
    const countries: Array<TCountry> = await getData(`${API_URL}/all?fields=name&fields=cca3&fields=area`);
    return countries.reduce((result: { [keys in string]: TCountry }, country: TCountry) => {
        result[country.cca3] = country;
        return result;
    }, {});
}

async function getCodeByName(name: string): Promise<TCountry> {
    return await getData(`${API_URL}/name/${name}?fullText=true&fields=cca3&fields=borders&fields=name`).then((res) =>
        !res.status ? res[0] : Promise.reject(res)
    );
}

async function getBordersByCode(code: string | undefined) {
    if (code === 'BRN') {
        const result: Array<TCountry> = await getData(
            `${API_URL}/name/Brunei?fullText=true&fields=cca3&fields=borders&fields=name`
        );
        return result[0];
    }
    const result: TCountry = await getData(`${API_URL}/alpha/${code}?fields=cca3&fields=borders&fields=name`);
    return result;
}

async function findRoute(fromCountry: string, toCountry: string) {
    const errorResult = (message: string) =>
        Promise.reject({
            status: 'error',
            message,
        });

    const startCountry: TCountry = await getCodeByName(fromCountry);
    const endCountry: TCountry = await getCodeByName(toCountry);

    if (!startCountry.borders.length || !endCountry.borders.length) {
        return errorResult('No ground route between countries');
    }

    let requestCounter: number = 2;
    const visited: { [key: string]: number } = {};
    const routes: { [key: string]: string[] } = {};
    const stack: Array<string> = [...startCountry.borders];
    routes[startCountry.cca3] = [startCountry.name.common];

    while (stack.length) {
        // eslint-disable-next-line no-await-in-loop
        const country: TCountry = await getBordersByCode(stack.shift());
        requestCounter += 1;
        visited[country.cca3] = 1;
        let minDestination = Infinity;

        country.borders.forEach((element) => {
            if (!stack.includes(element) && !visited[element]) {
                stack.push(element);
            }
            if (routes[element] && minDestination >= routes[element].length) {
                routes[country.cca3] = [...routes[element], country.name.common];
                minDestination = routes[element].length;
            }
        });

        if (country.borders.includes(endCountry.cca3)) {
            minDestination = Infinity;

            endCountry.borders.forEach((element) => {
                if (routes[element] && minDestination >= routes[element].length) {
                    routes[endCountry.cca3] = [...routes[element], endCountry.name.common];
                    minDestination = routes[element].length;
                }
            });
            return { status: 'ok', requestCount: requestCounter, route: routes[endCountry.cca3] };
        }
    }
    return errorResult('No ground route between countries');
}

const form = document.getElementById('form') as HTMLFormElement;
const fromCountry = document.getElementById('fromCountry') as HTMLInputElement;
const toCountry = document.getElementById('toCountry') as HTMLInputElement;
const countriesList = document.getElementById('countriesList') as HTMLDataListElement;
const submit = document.getElementById('submit') as HTMLButtonElement;
const output = document.getElementById('output') as HTMLDivElement;

(async () => {
    fromCountry.disabled = true;
    toCountry.disabled = true;
    submit.disabled = true;

    output.textContent = 'Loading…';
    const countriesData = await loadCountriesData();
    output.textContent = '';

    // Заполняем список стран для подсказки в инпутах
    Object.keys(countriesData)
        .sort((a, b) => {
            const nameA = countriesData[a].name.common;
            const nameB = countriesData[b].name.common;
            if (nameA < nameB) {
                return -1;
            }
            if (nameA > nameB) {
                return 1;
            }
            return 0;
        })
        .forEach((code) => {
            const option = document.createElement('option');
            option.value = countriesData[code].name.common;
            countriesList.appendChild(option);
        });

    fromCountry.disabled = false;
    toCountry.disabled = false;
    submit.disabled = false;

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (fromCountry.value && toCountry.value) {
            fromCountry.disabled = true;
            toCountry.disabled = true;
            submit.disabled = true;
            output.textContent = `Calculating path from ${fromCountry.value} to ${toCountry.value} …`;

            findRoute(fromCountry.value, toCountry.value)
                .then((res) => {
                    if (res.status === 'ok' && res.route.length) {
                        output.innerHTML = `Request count: ${res.requestCount} <br />`;
                        output.innerHTML += `Countries in route: ${res.route.length} <br />`;
                        output.innerHTML += `Route: ${res.route.join(' → ')}`;
                    }
                })
                .catch((error) => {
                    if (error.message) {
                        output.innerHTML = error.message;
                    } else {
                        output.innerHTML = 'Unknown error';
                    }
                })
                .finally(() => {
                    fromCountry.disabled = false;
                    toCountry.disabled = false;
                    submit.disabled = false;
                });
        } else {
            output.textContent = 'Please, select both countries';
        }
    });
})();
