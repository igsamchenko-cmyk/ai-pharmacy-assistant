/**
 * What the pharmacist is told when a check that only the server can answer
 * fails.
 *
 * Both screens can be opened offline — their code is precached because the app
 * puts them on the home screen as shortcuts — and both can search the local
 * catalog. Neither can *confirm* anything without the server. The offline
 * wording therefore explains the cause and the next step, but never softens the
 * verdict: an unconfirmed position stays unconfirmed, because "we could not
 * reach the server" is not evidence that dispensing is safe.
 */
export interface ServerCheckFailure {
  title: string;
  body: string;
}

export function dispensingResolutionFailure(
  offline: boolean,
): ServerCheckFailure {
  return offline
    ? {
        title: "Немає зв'язку — позицію не підтверджено",
        body: "Пошук у каталозі працює офлайн, але підтвердження точної реєстрової позиції звіряється на сервері. Відновіть зв'язок і повторіть — не використовуйте непідтверджену позицію як оперативну довідку.",
      }
    : {
        title: "Точну позицію не підтверджено",
        body: "Не використовуйте неповну картку як оперативну довідку.",
      };
}

export function interactionCheckFailure(offline: boolean): ServerCheckFailure {
  return offline
    ? {
        title: "Немає зв'язку — взаємодії не перевірено",
        body: "Перевірка взаємодій звіряється на сервері, тому даних про взаємодію не показано. Список обраних позицій збережено — відновіть зв'язок і повторіть перевірку.",
      }
    : {
        title: "Точні реєстрові позиції не звірено",
        body: "Не вдалося звірити точні реєстрові позиції. Дані про взаємодію не показано.",
      };
}
