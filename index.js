const API_URL = 'https://restcountries.com/v3.1';

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
            // Если мы тут, значит, запрос выполнился.
            // Но там может быть 404, 500, и т.д., поэтому проверяем ответ.
            if (response.ok) {
                return response.json();
            }
            // Пример кастомной ошибки (если нужно проставить какие-то поля
            // для внешнего кода). Можно зареджектить и сам `response`, смотря
            // какой у вас контракт. Главное перевести код в ветку `catch`.
            return Promise.reject({
                status: response.status,
                customError: 'wtfPromise',
            });
        },

        // При сетевой ошибке (мы оффлайн) из fetch вылетит эксцепшн,
        // и мы попадём в `onRejected` или в `.catch()` на промисе.
        // Если не добавить `onRejected` или `catch`, при ошибке будет
        // эксцепшн `Uncaught (in promise)`.
        (error) => {
            // Если не вернуть `Promise.reject()`, для внешнего кода
            // промис будет зарезолвлен с `undefined`, и мы не попадём
            // в ветку `catch` для обработки ошибок, а скорее всего
            // получим другой эксцепшн, потому что у нас `undefined`
            // вместо данных, с которыми мы работаем.
            return Promise.reject(error);
        }
    );
}

// Загрузка списка стран с сервера
async function loadCountriesData() {
    let countries = [];
    try {
        // ПРОВЕРКА ОШИБКИ №1: ломаем этот урл, заменяя all на allolo,
        // получаем кастомную ошибку.
        countries = await getData('https://restcountries.com/v3.1/all?fields=name&fields=cca3&fields=area');
    } catch (error) {
        // console.log('catch for getData');
        // console.error(error);
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
 * @param {Object} countriesData - список загруженных стран
 * @returns String - код страны
 */
function getCodeByName(name, countriesData) {
    return Object.keys(countriesData).find((code) => countriesData[code].name.common === name);
}

/**
 * Получения списка кодов граничащих стран.
 * @param {String} code - код страны, по которой нужен список кодов
 * @returns - список кодов в виде массива
 */
async function getBordersByCode(code) {
    const result = await getData(`${API_URL}/alpha/${code}?fields=cca3&fields=borders&fields=name`);
    return result;
}

/**
 * Функция поиска минимального маршрута между двумя странами через поиск в ширину.
 * @param {String} fromCountry - код начальной страны
 * @param {String} toCountry - код страны назначения
 * @returns - количество запросов на сервер и кратчайший маршрут между странами в виде массива
 */
async function findRoute(fromCountry, toCountry) {
    try {
        // Получаем границы по начальной и конечной странам
        const [startCountry, endCountry] = await Promise.all([
            getBordersByCode(fromCountry),
            getBordersByCode(toCountry),
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
            const country = await getBordersByCode(stack.shift());
            requestCounter += 1;
            visited[country.cca3] = true;
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

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const output = document.getElementById('output');

(async () => {
    fromCountry.disabled = true;
    toCountry.disabled = true;
    submit.disabled = true;

    output.textContent = 'Loading…';
    let countriesData = {};
    try {
        // ПРОВЕРКА ОШИБКИ №2: Ставим тут брейкпоинт и, когда дойдёт
        // до него, переходим в оффлайн-режим. Получаем эксцепшн из `fetch`.
        countriesData = await loadCountriesData();
    } catch (error) {
        // console.log('catch for loadCountriesData');
        // console.error(error);
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

            findRoute(getCodeByName(fromCountry.value, countriesData), getCodeByName(toCountry.value, countriesData))
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
