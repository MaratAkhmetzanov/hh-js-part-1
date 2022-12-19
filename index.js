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

async function getCodeByName(name) {
    const result = await getData(`${API_URL}/name/${name}?fullText=true&fields=cca3&fields=borders&fields=name`);
    return result.status ? result : result[0];
}

async function getBordersByCode(code) {
    if (code === 'BRN') {
        const result = await getData(`${API_URL}/name/Brunei?fullText=true&fields=cca3&fields=borders&fields=name`);
        return result[0];
    }
    const result = await getData(`${API_URL}/alpha/${code}?fields=cca3&fields=borders&fields=name`);
    return result;
}

async function findRoute(fromCountry, toCountry) {
    const errorResult = (message) =>
        Promise.reject({
            status: 'error',
            message,
        });

    const startCountry = await getCodeByName(fromCountry);
    const endCountry = await getCodeByName(toCountry);

    if (startCountry.status) {
        return errorResult('Unable to calculate route. Cannot find "from" country');
    }
    if (endCountry.status) {
        return errorResult('Unable to calculate route. Cannot find "to" country');
    }
    if (!startCountry.borders.length || !endCountry.borders.length) {
        return errorResult('No ground route between countries');
    }

    let requestCounter = 2;
    const visited = [];
    const routes = [];
    const stack = [...startCountry.borders];
    routes[startCountry.cca3] = [startCountry.name.common];

    while (stack.length) {
        // eslint-disable-next-line no-await-in-loop
        const country = await getBordersByCode(stack.shift());
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
