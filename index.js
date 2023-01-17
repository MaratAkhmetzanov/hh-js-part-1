import Maps from '/maps.js';

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const output = document.getElementById('output');
let countriesData = {};

// Загрузка данных через промисы
function getData(url) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
    return fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        redirect: 'follow',
    }).then(
        (response) => {
            if (response.ok) {
                return response.json();
            }
            return Promise.reject({
                status: response.status,
                customError: 'wtfPromise',
            });
        },
        (error) => {
            return Promise.reject(error);
        }
    );
}

// Загрузка списка стран с сервера
async function loadCountriesData() {
    let countries = [];
    try {
        countries = await getData(
            'https://restcountries.com/v3.1/all?fields=name&fields=cca3&fields=area&fields=borders'
        );
    } catch (error) {
        throw error;
    }
    return countries.reduce((result, country) => {
        result[country.cca3] = country;
        return result;
    }, {});
}

/**
 * Поиск кода страны в списке загруженных стран, так как из инпута достаётся название страны, а не код.
 * @param {String} name - название страны
 * @returns String - код страны
 */
function getCodeByName(name) {
    return Object.keys(countriesData).find((code) => countriesData[code].name.common === name);
}

/**
 * Получения списка кодов граничащих стран.
 * @param {String} code - код страны, по которой нужен список кодов
 * @returns - список кодов в виде массива
 */
async function getBordersByCodeInternal(code) {
    return countriesData[code].borders;
}

/**
 * Функция поиска минимального маршрута между двумя странами через поиск в ширину.
 * @param {String} fromCountry - код начальной страны
 * @param {String} toCountry - код страны назначения
 * @returns - количество запросов на сервер и кратчайший маршрут между странами в виде массива
 */
async function findRoute(fromCountry, toCountry) {
    try {
        Maps.setEndPoints(fromCountry, toCountry);
        // Получаем границы по начальной и конечной странам
        const [startCountry, endCountry] = await Promise.all([
            getBordersByCodeInternal(fromCountry),
            getBordersByCodeInternal(toCountry),
        ]);

        if (startCountry.status === 400) {
            throw new Error('Unable to calculate route. Cannot find "from" country');
        }
        if (endCountry.status === 400) {
            throw new Error('Unable to calculate route. Cannot find "to" country');
        }
        if (!startCountry.borders.length || !endCountry.borders.length) {
            throw new Error('No ground route between countries');
        }

        let requestCounter = 2; // Счетчик количества запросов, с учетом запросов по startCountry и endCountry
        const visited = {}; // Список посещенных стран. Чтобы не обрабатывать уже посещенные страны
        const routes = {}; // Список кратчайших маршрутов между странами.
        const stack = [...startCountry.borders]; // Стек для последовательного прохождения по списку граничащих стран

        routes[startCountry.cca3] = [startCountry.name.common];

        while (stack.length) {
            // eslint-disable-next-line no-await-in-loop
            const country = await getBordersByCodeInternal(stack.shift());
            requestCounter += 1;
            visited[country.cca3] = true;
            Maps.markAsVisited([country.cca3]);
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
                return { requestCount: requestCounter, route: routes[endCountry.cca3] };
            }
        }
        throw new Error('No ground route between countries');
    } catch (error) {
        throw new Error(error);
    }
}

(async () => {
    fromCountry.disabled = true;
    toCountry.disabled = true;
    submit.disabled = true;

    output.textContent = 'Loading…';
    try {
        countriesData = await loadCountriesData();
    } catch (error) {
        output.textContent = 'Something went wrong. Try to reset your compluter.';
        return;
    }
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
        if (!fromCountry.value || !toCountry.value) {
            output.textContent = 'Please, select both countries';
        } else {
            fromCountry.disabled = true;
            toCountry.disabled = true;
            submit.disabled = true;

            output.textContent = `Calculating path from ${fromCountry.value} to ${toCountry.value} …`;

            findRoute(getCodeByName(fromCountry.value), getCodeByName(toCountry.value))
                .then((res) => {
                    output.innerHTML = `Request count: ${res.requestCount} <br />`;
                    output.innerHTML += `Countries in route: ${res.route.length} <br />`;
                    output.innerHTML += `Route: ${res.route.join(' → ')}`;
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
        }
    });
})();
