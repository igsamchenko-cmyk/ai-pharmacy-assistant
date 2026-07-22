import type { RegistryProductResult } from "@workspace/api-client-react";

export type NationalListStatus = RegistryProductResult["nationalListStatus"];

export type NationalListVerdict = {
  shortLabel: string;
  label: string;
  description: string;
  isConfirmed: boolean;
};

const VERDICTS: Record<NationalListStatus, NationalListVerdict> = {
  exact: {
    shortLabel: "У Нацпереліку",
    label: "У Нацпереліку",
    description:
      "Для цієї реєстрової позиції підтверджено відповідність чинному Нацпереліку.",
    isConfirmed: true,
  },
  ingredient_only: {
    shortLabel: "Не підтверджено у Нацпереліку",
    label: "Не підтверджено для цієї реєстрової позиції",
    description:
      "МНН або склад є у Нацпереліку, але форма, шлях введення чи дозування цієї реєстрової позиції не мають точного підтвердження.",
    isConfirmed: false,
  },
  uncertain: {
    shortLabel: "Статус Нацпереліку не визначено",
    label: "Статус Нацпереліку не визначено",
    description:
      "Автоматична перевірка не дає надійного висновку для цієї реєстрової позиції. Не трактуйте її як включену до Нацпереліку.",
    isConfirmed: false,
  },
  not_listed: {
    shortLabel: "Не у Нацпереліку",
    label: "Не у Нацпереліку",
    description:
      "У чинному Нацпереліку немає відповідного МНН або фіксованої комбінації для цієї реєстрової позиції.",
    isConfirmed: false,
  },
  not_applicable: {
    shortLabel: "Статус недоступний",
    label: "Не визначено — активний Нацперелік недоступний",
    description:
      "Немає активної перевіреної редакції Нацпереліку, тому належність цієї реєстрової позиції зараз не визначена.",
    isConfirmed: false,
  },
};

export function nationalListVerdict(
  status: NationalListStatus,
): NationalListVerdict {
  return VERDICTS[status];
}
