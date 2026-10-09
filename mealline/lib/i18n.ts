/**
 * Localised strings for applicant-facing turns, read-backs, templates, and
 * status views. English, Vietnamese, and Spanish.
 *
 * NOTE (demo): the Vietnamese and Spanish wording below was written for the
 * demo script and has NOT yet been reviewed by a fluent speaker. Do not claim
 * validated Vietnamese/Spanish support until that review happens.
 * Reviewer: Giap Nguyen (pending).
 */
export type Locale = "en" | "vi" | "es";

export const SUPPORTED_LOCALES: Locale[] = ["en", "vi", "es"];

export function normalizeLocale(v: unknown): Locale {
  if (v === "vi") return "vi";
  if (v === "es") return "es";
  return "en";
}

const en = {
  greeting:
    "Hello, this is MealLine, a food delivery assistance service. Please tell me how I can help you, in any language.",
  greeting_voice_parts: [
    { locale: "en" as Locale, text: "Hello, this is MealLine, a food assistance service." },
    { locale: "es" as Locale, text: "Hola, le habla MealLine, un servicio de asistencia alimentaria." },
    { locale: "vi" as Locale, text: "Xin chào, đây là MealLine, dịch vụ hỗ trợ thực phẩm." },
    { locale: "en" as Locale, text: "Please say your language." },
    { locale: "en" as Locale, text: "English." },
    { locale: "es" as Locale, text: "Español." },
    { locale: "vi" as Locale, text: "Tiếng Việt." },
  ],
  greeting_vi_offer: "Xin chào, đây là MealLine, dịch vụ hỗ trợ giao thực phẩm.",
  ask_language: "I didn't catch that. Do you prefer English, Vietnamese, or Spanish? Just say the language name.",
  ask_address:
    "What is the delivery address? Please say the street address, city, and ZIP code.",
  ask_household:
    "How many people live in your household, including yourself?",
  ask_availability:
    "Which days and times are usually good for a delivery? For example: weekday mornings, or Saturday afternoon.",
  ask_contact:
    "How should we reach you with updates? Press 1 for a phone callback, or press 2 for a status link to check online. For a callback, please also tell me your phone number.",
  ask_phone: "Please say or enter your 10 digit phone number.",
  ask_accommodation:
    "Do you need any accommodation for the delivery, such as leaving groceries at the door? You can say none.",
  ask_dietary:
    "Does anyone in your household have food allergies, or foods you avoid? Press 1 if none, or tell me the foods to avoid. For example: peanuts, dairy, pork.",
  ask_equipment:
    "For packing the right foods: do you have a working stove and a fridge? Press 1 for both, 2 for stove only, 3 for fridge only, or 4 for neither.",
  readback_intro: "Let me read back what I have so far.",
  readback_address: (a: string) => `Delivery address: ${a}.`,
  readback_household: (n: number) => `Household size: ${n}.`,
  readback_availability: (a: string) => `Availability: ${a}.`,
  readback_contact_call: (p: string) => `We will call you at ${p}.`,
  readback_contact_link: () =>
    "You will check your status online with a secure link. No phone call needed.",
  readback_accommodation: (a: string) => `Delivery accommodation: ${a}.`,
  readback_dietary: (a: string) => `Foods to avoid: ${a}.`,
  readback_equipment: (a: string) => `Kitchen equipment: ${a}.`,
  confirm_question:
    "Is all of that correct? Press 1 for yes, or press 2 to correct something.",
  thanks_submitted:
    "Thank you. Your request has been received and sent to our staff for review. This is not a confirmed delivery yet. We will contact you with next steps.",
  status_link_issued:
    "Your secure status link is shown on screen now. Keep it private; anyone with the link can see your request status.",
  no_input:
    "I did not hear you. Please try again, or say person to speak with someone.",
  no_input_final:
    "I am having trouble hearing you. I will connect you with a staff member.",
  transfer_to_human: "Connecting you to a staff member now. Please hold.",
  transfer_unavailable:
    "Our staff line is unavailable right now. We saved your request and a staff member will call you back.",
  unsupported_language:
    "I am sorry, I can only help in English or Vietnamese right now. A staff member will follow up about your language.",
  repeat_offer: "Of course. ",
  model_unavailable:
    "I am having trouble understanding. Let me ask a simpler question.",
  approved_update_voice: (window: string) =>
    `This is MealLine with an update. Your grocery delivery is scheduled for ${window}. If you need to change it, please call us back. Thank you.`,
  approved_update_voicemail: () =>
    "This is MealLine with a delivery update. Please call us back at our main number for details. Thank you.",
  callback_saved:
    "We saved your request. A staff member will call you back.",
  hangup_saved: "Your progress was saved. Goodbye.",
  sms_receipt: (caseNumber: string, url: string) =>
    `MealLine: your request ${caseNumber} was received and is under review. Check your status here: ${url}`,
  day_names: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
  time_names: { morning: "morning", afternoon: "afternoon", evening: "evening" } as Record<string,string>,
};

const vi: typeof en = {
  greeting:
    "Xin chào, đây là MealLine, dịch vụ hỗ trợ giao thực phẩm. Xin cho biết chúng tôi có thể giúp gì cho quý vị, bằng bất kỳ ngôn ngữ nào.",
  greeting_voice_parts: [
    { locale: "en" as Locale, text: "Hello, this is MealLine, a food assistance service." },
    { locale: "es" as Locale, text: "Hola, le habla MealLine, un servicio de asistencia alimentaria." },
    { locale: "vi" as Locale, text: "Xin chào, đây là MealLine, dịch vụ hỗ trợ thực phẩm." },
    { locale: "en" as Locale, text: "Please say your language." },
    { locale: "en" as Locale, text: "English." },
    { locale: "es" as Locale, text: "Español." },
    { locale: "vi" as Locale, text: "Tiếng Việt." },
  ],
  greeting_vi_offer: "Xin chào, đây là MealLine, dịch vụ hỗ trợ giao thực phẩm.",
  ask_language: "Tôi không nghe rõ. Quý vị muốn dùng tiếng Anh, tiếng Việt, hay tiếng Tây Ban Nha? Xin nói tên ngôn ngữ.",
  ask_address:
    "Địa chỉ giao hàng là gì? Xin cho biết số nhà và tên đường, thành phố, và mã bưu điện ZIP.",
  ask_household:
    "Gia đình quý vị có bao nhiêu người, kể cả quý vị?",
  ask_availability:
    "Những ngày và giờ nào thuận tiện để nhận hàng? Ví dụ: buổi sáng các ngày trong tuần, hoặc chiều thứ Bảy.",
  ask_contact:
    "Chúng tôi nên liên lạc với quý vị bằng cách nào? Nhấn 1 để chúng tôi gọi lại, hoặc nhấn 2 để nhận liên kết tự kiểm tra trực tuyến. Nếu muốn chúng tôi gọi lại, xin cho biết số điện thoại.",
  ask_phone: "Xin cho biết số điện thoại 10 số của quý vị.",
  ask_accommodation:
    "Quý vị có cần hỗ trợ gì khi giao hàng không, ví dụ như để hàng trước cửa? Quý vị có thể nói không cần.",
  ask_dietary:
    "Trong gia đình có ai bị dị ứng thực phẩm, hoặc có món nào cần tránh không? Nhấn 1 nếu không có, hoặc cho biết các món cần tránh. Ví dụ: đậu phộng, sữa, thịt heo.",
  ask_equipment:
    "Để chuẩn bị thực phẩm phù hợp: gia đình có bếp nấu và tủ lạnh đang dùng được không? Nhấn 1 nếu có cả hai, 2 nếu chỉ có bếp, 3 nếu chỉ có tủ lạnh, hoặc 4 nếu không có.",
  readback_intro: "Tôi xin đọc lại những thông tin đã ghi nhận.",
  readback_address: (a: string) => `Địa chỉ giao hàng: ${a}.`,
  readback_household: (n: number) => `Số người trong gia đình: ${n}.`,
  readback_availability: (a: string) => `Thời gian thuận tiện: ${a}.`,
  readback_contact_call: (p: string) => `Chúng tôi sẽ gọi cho quý vị theo số ${p}.`,
  readback_contact_link: () =>
    "Quý vị sẽ tự kiểm tra trạng thái bằng liên kết bảo mật. Không cần nghe điện thoại.",
  readback_accommodation: (a: string) => `Hỗ trợ khi giao hàng: ${a}.`,
  readback_dietary: (a: string) => `Thực phẩm cần tránh: ${a}.`,
  readback_equipment: (a: string) => `Thiết bị bếp: ${a}.`,
  confirm_question:
    "Tất cả thông tin trên có đúng không? Nhấn 1 nếu đúng rồi, hoặc nhấn 2 để sửa.",
  thanks_submitted:
    "Cảm ơn quý vị. Yêu cầu của quý vị đã được ghi nhận và chuyển cho nhân viên xem xét. Đây chưa phải là lịch giao hàng đã xác nhận. Chúng tôi sẽ liên lạc với quý vị về các bước tiếp theo.",
  status_link_issued:
    "Liên kết trạng thái bảo mật của quý vị hiện trên màn hình. Xin giữ kín; bất kỳ ai có liên kết đều có thể xem trạng thái yêu cầu của quý vị.",
  no_input:
    "Tôi không nghe rõ. Xin thử lại, hoặc nói gặp nhân viên để nói chuyện với nhân viên.",
  no_input_final:
    "Tôi gặp khó khăn khi nghe quý vị. Tôi sẽ chuyển quý vị đến nhân viên.",
  transfer_to_human: "Đang chuyển quý vị đến nhân viên. Xin vui lòng chờ.",
  transfer_unavailable:
    "Hiện đường dây nhân viên không liên lạc được. Chúng tôi đã lưu yêu cầu của quý vị và nhân viên sẽ gọi lại.",
  unsupported_language:
    "Xin lỗi, hiện tôi chỉ có thể hỗ trợ bằng tiếng Anh hoặc tiếng Việt. Nhân viên sẽ liên lạc lại với quý vị về ngôn ngữ quý vị cần.",
  repeat_offer: "Vâng, ",
  model_unavailable:
    "Tôi gặp khó khăn khi hiểu ý quý vị. Để tôi hỏi một câu đơn giản hơn.",
  approved_update_voice: (window: string) =>
    `Đây là MealLine với thông báo mới. Lịch giao thực phẩm của quý vị là ${window}. Nếu cần thay đổi, xin gọi lại cho chúng tôi. Cảm ơn quý vị.`,
  approved_update_voicemail: () =>
    "Đây là MealLine với thông báo về lịch giao hàng. Xin gọi lại số điện thoại chính của chúng tôi để biết chi tiết. Cảm ơn quý vị.",
  callback_saved:
    "Chúng tôi đã lưu yêu cầu của quý vị. Nhân viên sẽ gọi lại cho quý vị.",
  hangup_saved: "Thông tin của quý vị đã được lưu. Tạm biệt.",
  sms_receipt: (caseNumber: string, url: string) =>
    `MealLine: yêu cầu ${caseNumber} của quý vị đã được ghi nhận và đang chờ xem xét. Kiểm tra trạng thái tại: ${url}`,
  day_names: ["thứ Hai","thứ Ba","thứ Tư","thứ Năm","thứ Sáu","thứ Bảy","Chủ nhật"],
  time_names: { morning: "buổi sáng", afternoon: "buổi chiều", evening: "buổi tối" } as Record<string,string>,
};

const es: typeof en = {
  greeting:
    "Hola, le habla MealLine, un servicio de asistencia alimentaria. Dígame cómo puedo ayudarle, en cualquier idioma.",
  greeting_voice_parts: [
    { locale: "en" as Locale, text: "Hello, this is MealLine, a food assistance service." },
    { locale: "es" as Locale, text: "Hola, le habla MealLine, un servicio de asistencia alimentaria." },
    { locale: "vi" as Locale, text: "Xin chào, đây là MealLine, dịch vụ hỗ trợ thực phẩm." },
    { locale: "en" as Locale, text: "Please say your language." },
    { locale: "en" as Locale, text: "English." },
    { locale: "es" as Locale, text: "Español." },
    { locale: "vi" as Locale, text: "Tiếng Việt." },
  ],
  greeting_vi_offer: "Xin chào, đây là MealLine, dịch vụ hỗ trợ giao thực phẩm.",
  ask_language: "No le entendí. ¿Prefiere inglés, vietnamita o español? Solo diga el nombre del idioma.",
  ask_address:
    "¿Cuál es la dirección de entrega? Por favor diga la calle, la ciudad y el código postal.",
  ask_household:
    "¿Cuántas personas viven en su hogar, incluyendo a usted?",
  ask_availability:
    "¿Qué días y horarios le convienen para la entrega? Por ejemplo: mañanas entre semana, o sábado por la tarde.",
  ask_contact:
    "¿Cómo debemos avisarle sobre su solicitud? Pulse 1 para que le llamemos, o pulse 2 para un enlace de estado en línea. Si quiere que le llamemos, dígame su número de teléfono.",
  ask_phone: "Por favor diga o ingrese su número de teléfono de 10 dígitos.",
  ask_accommodation:
    "¿Necesita alguna ayuda con la entrega, por ejemplo dejar los alimentos en la puerta? Puede decir ninguna.",
  ask_dietary:
    "¿Alguien en su hogar tiene alergias alimentarias o alimentos que evita? Pulse 1 si ninguno, o dígame los alimentos a evitar. Por ejemplo: maní, lácteos, cerdo.",
  ask_equipment:
    "Para empacar los alimentos adecuados: ¿tiene estufa y refrigerador funcionando? Pulse 1 para ambos, 2 para solo estufa, 3 para solo refrigerador, o 4 para ninguno.",
  readback_intro: "Permítame repetir la información que tengo hasta ahora.",
  readback_address: (a: string) => `Dirección de entrega: ${a}.`,
  readback_household: (n: number) => `Personas en el hogar: ${n}.`,
  readback_availability: (a: string) => `Disponibilidad: ${a}.`,
  readback_contact_call: (p: string) => `Le llamaremos al ${p}.`,
  readback_contact_link: () =>
    "Consultará su estado en línea con un enlace seguro. No necesita llamada telefónica.",
  readback_accommodation: (a: string) => `Ayuda con la entrega: ${a}.`,
  readback_dietary: (a: string) => `Alimentos a evitar: ${a}.`,
  readback_equipment: (a: string) => `Equipo de cocina: ${a}.`,
  confirm_question:
    "¿Todo esto es correcto? Pulse 1 para sí, o pulse 2 para corregir algo.",
  thanks_submitted:
    "Gracias. Hemos recibido su solicitud y la enviamos a nuestro personal para su revisión. Esto aún no es una entrega confirmada. Le contactaremos sobre los próximos pasos.",
  status_link_issued:
    "Su enlace seguro de estado aparece en pantalla ahora. Manténgalo privado; quien tenga el enlace puede ver el estado de su solicitud.",
  no_input:
    "No le escuché. Inténtelo de nuevo, o diga persona para hablar con alguien.",
  no_input_final:
    "Tengo dificultades para escucharle. Le conectaré con un miembro del personal.",
  transfer_to_human: "Le conecto con un miembro del personal ahora. Por favor espere.",
  transfer_unavailable:
    "Nuestra línea del personal no está disponible en este momento. Guardamos su solicitud y un miembro del personal le devolverá la llamada.",
  unsupported_language:
    "Lo siento, por ahora solo puedo ayudar en inglés, vietnamita o español. Un miembro del personal le contactará sobre su idioma.",
  repeat_offer: "Por supuesto. ",
  model_unavailable:
    "Tengo dificultades para entenderle. Permítame hacer una pregunta más simple.",
  approved_update_voice: (window: string) =>
    `Le habla MealLine con una actualización. Su entrega de alimentos está programada para ${window}. Si necesita cambiarla, por favor devuélvanos la llamada. Gracias.`,
  approved_update_voicemail: () =>
    "Le habla MealLine con una actualización de entrega. Por favor devuelva la llamada a nuestro número principal para más detalles. Gracias.",
  callback_saved:
    "Guardamos su solicitud. Un miembro del personal le devolverá la llamada.",
  hangup_saved: "Su progreso fue guardado. Adiós.",
  sms_receipt: (caseNumber: string, url: string) =>
    `MealLine: su solicitud ${caseNumber} fue recibida y está en revisión. Consulte su estado aquí: ${url}`,
  day_names: ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"],
  time_names: { morning: "por la mañana", afternoon: "por la tarde", evening: "por la noche" } as Record<string,string>,
};

export const STRINGS: Record<Locale, typeof en> = { en, vi, es };

export function t(locale: Locale): typeof en {
  return STRINGS[normalizeLocale(locale)];
}
