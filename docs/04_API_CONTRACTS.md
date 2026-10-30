# API v1

Базовый путь `/api/v1`. JSON. Сессионная cookie `osnova_session`. Мутации из браузера проверяют Origin; API и сайт располагаются на одном origin. Ошибки: `{error: string, details?: string[]}`, HTTP 400/401/403/404/409/410/413/415/429/500.

`POST /auth/login` принимает `{email, password, rememberMe?}`. По умолчанию `rememberMe=true`: прежняя постоянная HttpOnly/SameSite=Strict cookie и серверный сеанс на 14 дней. При `false` cookie становится сеансовой, без Max-Age/Expires, а срок на сервере ограничен 24 часами. Изменение совместимо с прежними клиентами; активация кабинета и гостевые ссылки сохраняют свои сроки. Восстановление через автоматические письма не подключено: экран входа объясняет получение нового приглашения ученику и обращение к администратору преподавателю.

Обновление доски: `POST /boards/:id/canvas` идемпотентно возвращает/создаёт `canvas_page_id` с общим холстом. При преобразовании исходные дополнительные сцены и их история сохраняются. После преобразования создание/удаление страниц и запись в старые дополнительные сцены отклоняются, снимки остаются доступны по прежним правам. PATCH доски принимает `background: white|grid|ruled|dots` для участников с правом редактирования; переименование и архив остаются действиями владельца. События `board-background` и `canvas-updated` синхронизируют фон и преобразование доски.

| Метод и путь                       | Сценарий                                                          |
| ---------------------------------- | ----------------------------------------------------------------- |
| GET /bootstrap                     | Доступность первоначальной настройки                              |
| POST /auth/setup                   | Первый преподаватель: name, email, password, setupToken           |
| POST /auth/login, /auth/logout     | Вход / выход                                                      |
| GET, PATCH /me                     | Профиль и настройки                                               |
| POST /auth/password                | currentPassword, newPassword; отзыв старых сеансов                |
| GET /auth/sessions                 | Активные сеансы без токенов                                       |
| POST /auth/revoke-other-sessions   | Завершить остальные сеансы                                        |
| GET, POST /students                | Свои ученики / создать ученика                                    |
| PATCH /students/:id                | Карточка, программа, пауза                                        |
| POST /students/:id/invite          | Одноразовое приглашение в кабинет на 7 дней                       |
| POST /invites/info                 | Проверка токена и вида доступа без раскрытия имени ученика        |
| POST /invites/redeem               | Обмен токена из URL-fragment на сессию                            |
| DELETE /invites/:id                | Отзыв приглашения и гостевого сеанса                              |
| GET, POST /boards                  | Доступные доски / новая доска                                     |
| GET, PATCH /boards/:id             | Метаданные, канонический холст / название, архив, фон             |
| POST /boards/:id/canvas            | Идемпотентный переход на единый холст                             |
| POST /boards/:id/pages             | Прежний формат: новая страница до перехода на единый холст        |
| PATCH, DELETE /pages/:id           | Название, порядок / удаление с сохранением хотя бы одной страницы |
| GET /pages/:id/snapshot            | Сцена и ревизия                                                   |
| POST /pages/:id/operations         | Идемпотентное элементное изменение                                |
| GET /pages/:id/history             | До 150 последних снимков с метками урока                          |
| POST /pages/:id/restore            | snapshotId, expectedRevision; восстановление учителем             |
| GET, POST /boards/:id/invites      | Список без токенов / выдача ссылки                                |
| GET /boards/:id/members            | Имена и права участников для владельца                            |
| DELETE /boards/:id/members/:userId | Закрытие доступа и сокета                                         |
| POST /files                        | Multipart: boardId?, excalidrawId?, file                          |
| GET /files/:id                     | Проверка доступа и содержимое; `?download=1` — скачивание         |
| GET /boards/:id/files              | Метаданные файлов доски                                           |
| GET, POST /records/:kind           | Свои записи / создание учителем                                   |
| PATCH, DELETE /records/:kind/:id   | Изменение по правам / удаление учителем                           |
| GET /audit                         | Журнал событий владельца                                          |
| GET /health                        | Проверка подключения к БД без личных данных                       |

`kind`: lesson, homework, material, result, report, transaction, document, task, note, notification. Точные схемы: `packages/contracts/index.ts`.

Создание записи: `{studentId?: UUID|null, data: {...}}`. PATCH объединяет проверенные поля с имеющейся записью. Ученик может изменять только свой ответ, файлы ответа и статус draft/submitted до проверки; у своего урока — запрос переноса; у своего уведомления — флаг read. Права проверяются сервером, независимо от наличия раздела в меню.

Операция: `{operationId: UUID, changes: [{baseVersion: number|null, element: ExcalidrawElement}]}`. Ответ: `{operationId,pageId,revision,elements,conflicts,duplicate?}`. Подтверждение означает завершённую транзакцию. `isDeleted` хранится как tombstone. Отсутствующий элемент не означает удаления. iframe/embeddable не разрешены.

Socket.IO использует ту же cookie. `join-page {pageId}` → ack `{ok,peers}`; сервер проверяет доступ. Серверные события: `scene-update`, `pages-updated`, `presence`, `cursor`, `notification`, `access-revoked`. Полезная нагрузка курсора ограничивается; сцена передаётся через транзакционное HTTP API. После reconnect повторяется получение snapshot и отправка неподтверждённых операций.

## Постоянные комнаты и уроки

| Метод и путь                                      | Сценарий                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET /classrooms                                   | Доступные комнаты, автоматическое создание комнат прежних учеников                                                           |
| POST /classrooms                                  | `{studentIds: UUID[]}` — найти/создать постоянную комнату для этого состава                                                  |
| POST /lessons/:id/classroom                       | Привязать запись расписания к комнате, вернуть данные входа                                                                  |
| GET /classrooms/:id                               | Комната, состав, права, активное и ближайшее занятия, последние 30 сессий, присутствие; `?lessonId=` выбирает занятие        |
| POST /classrooms/preview                          | Публичный вход по `{roomId, token}`; личная ссылка определяет активную/следующую мини-группу                                 |
| POST /classrooms/redeem                           | `{roomId, token, name}` → ограниченная гостевая cookie и фактический roomId                                                  |
| POST /classrooms/:id/join                         | `{name, lessonId?}`; ученик получает `{waiting:true}` или активную сессию, преподаватель начинает занятие                    |
| GET /classrooms/:id/sessions/:sessionId           | Сессия, посещение и запись расписания; private_note видна только владельцу                                                   |
| POST /classrooms/:id/sessions/:sessionId/end      | Идемпотентное завершение владельцем, контрольный снимок, статус completed                                                    |
| GET /classrooms/:id/sessions/:sessionId/materials | Неизменяемая сцена, фон и исходные файлы завершённого урока                                                                  |
| PATCH /classrooms/:id/sessions/:sessionId/summary | Владелец: `{summary, privateNote, homework?:{title, description, due}}`; задания по одному на участника, повтор не дублирует |
| GET, POST /classrooms/:id/messages                | Последние 150 комментариев / `{id: UUID, body, name?}` с проверкой повтора                                                   |
| POST /classrooms/:id/link                         | Владелец индивидуальной комнаты: `{rotate:true}` или `{revoke:true}`                                                         |
| PATCH /classrooms/:id/members/:studentId          | Владелец: `{permission:"edit"                                                                                                | "view"}`; применяется и к личным гостевым сессиям |
| GET /pages/:id/history/:snapshotId                | Только владелец: сцена для предварительного просмотра перед восстановлением                                                  |

Ответ Classroom содержит `link` только владельцу индивидуальной комнаты; для группы владелец получает `memberLinks` — прежние личные ссылки учеников. Публичный preview содержит entryStudentId для правильного имени на входе. Ни ссылка, ни её секрет не возвращаются другим участникам. Просмотр и повторное копирование доступны владельцу, поэтому секрет личной ссылки хранится в БД, а его SHA-256 — в invites для проверки; куки-сессии по-прежнему хранят только хеши. Гостевые сессии по личной ссылке ограничены 12 часами, ссылка остаётся постоянной до отзыва. Общая анонимная ссылка группы не выдаётся.

Создание ученика автоматически возвращает classroom_id и создаёт его комнату/канонический холст в той же транзакции. Предмет хранится в student.subject и lesson.data.subject. Создание/изменение записи урока с участниками привязывает постоянную комнату. Статус live устанавливается только через join; во время занятия менять участников/статус вручную нельзя. После завершения нельзя сменить участников или вернуть planned; цену, описание и факт отмены после завершения можно уточнить. Запись с session нельзя удалить вместе с сохранённой историей — сервер отвечает 409.

Socket.IO: `join-classroom {roomId, stage:"lobby"|"lesson", name}` с проверкой доступа; `classroom-hand {raised:boolean}`. Серверные события: `classroom-state {participants,activeSession}`, `classroom-ended {sessionId}`, `classroom-message`, `classroom-permission`, `classroom-summary {sessionId}`. При reconnect клиент повторно входит и получает актуальное состояние. Все события урока отделены от элементных операций доски.

Предметные фигуры, стикеры и формулы используют существующий `/pages/:id/operations`: новые таблицы и HTTP-методы не требуются. Фигура — группа native-примитивов с `customData.boardFigure = {id,spec:{kind,width,height,depth},part}`; линия — `customData.boardLine = {kind,groupId}`. Листочек отмечен `customData.sticker`, его рукописные пометки — `customData.stickerAnnotation = {stickerId}`. Формула имеет `customData.formula.title`; новый текст/формулы представлены приватным image с редактируемым `customData.richText`, старые native text остаются допустимы. Закрепление сохраняется в native-поле `locked` и не меняет permission участника. Внутренние файловые методы остаются для рендеринга PDF, хотя отдельный пункт исходных файлов убран из интерфейса доски.

`customData.richText`: `text` ≤20000, `family` ≤64, `fontSize` 8–200, boolean `bold/italic/underline`, `align` left/center/right, `color`, опциональные положительный `maxWidth` ≤1800 и `containerId`. `richTextSize` хранит исходные размеры рендера для пересчёта размера шрифта после масштабирования. PNG/WebP загружаются обычным `/files` с boardId/excalidrawId до image-операции; отдельного публичного доступа к ним нет. `pictureSticker = {id,name}` обозначает предоставленный стикер. Закрепление/слои/дублирование используют существующие элементные операции с baseVersion и operationId; новых таблиц нет.
