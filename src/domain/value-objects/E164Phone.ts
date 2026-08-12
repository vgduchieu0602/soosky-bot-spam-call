export { E164Phone as default, InvalidE164PhoneError };

class InvalidE164PhoneError extends Error {
    constructor (message = "Phone number must be a valid US NANP number.") {
        super(message);
        this.name = "InvalidE164PhoneError";
    }
}

class E164Phone {
    private constructor (public readonly value: string) {}

    public static fromUs (rawValue: string): E164Phone {
        const raw = rawValue.trim();
        if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) {
            throw new InvalidE164PhoneError();
        }

        const digits = raw.replace(/\D/g, "");
        const nationalNumber = !raw.startsWith("+") && digits.length === 10
            ? digits
            : digits.length === 11 && digits.startsWith("1")
                ? digits.slice(1)
                : "";

        // NANP area and central-office codes never start with 0 or 1.
        if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(nationalNumber)) {
            throw new InvalidE164PhoneError();
        }
        return new E164Phone(`+1${nationalNumber}`);
    }
}
