import Image from "next/image";

const chainColors: Record<string, string> = {
  ethereum: "#627eea",
  base: "#0052ff",
  sonic: "#ffffff",
  hyperevm: "#97fce4",
  avalanche: "#e84142",
};

export function AssetLogo({
  asset,
  size,
}: {
  asset: "usdp" | "susdp";
  size: number;
}) {
  const symbol = asset === "usdp" ? "USDp" : "sUSDp";
  return (
    <Image
      className={`asset-logo asset-logo-${asset}`}
      src={`/tokens/${asset}.png`}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      priority
    />
  );
}

export function ChainLogo({ slug, name }: { slug: string; name: string }) {
  const common = {
    viewBox: "0 0 32 32",
    role: "img",
    "aria-label": `${name} logo`,
  } as const;

  const mark = (() => {
    switch (slug) {
      case "ethereum":
        return (
          <svg {...common}>
            <path fill="#fff" d="M16 3 8.5 16.2 16 12.8l7.5 3.4L16 3Z" />
            <path fill="#c8d2ff" d="m8.5 17.7 7.5 11.1V14.3l-7.5 3.4Z" />
            <path fill="#fff" d="M16 14.3v14.5l7.5-11.1-7.5-3.4Z" />
          </svg>
        );
      case "base":
        return (
          <svg {...common}>
            <rect width="32" height="32" rx="7" fill="#0052ff" />
          </svg>
        );
      case "sonic":
        return (
          <svg viewBox="0 0 60 57" role="img" aria-label={`${name} logo`}>
            <path
              fill="#fff"
              d="M35.5379 35.0248C24.6296 38.2 15.606 42.8312 9.9576 48.2576l-.2494.2408a28.9 28.9 0 0 0 4.9293 3.6568l.3828-.4536a55.1 55.1 0 0 1 4.9177-5.2528c4.622-4.4632 9.9108-8.3272 15.6057-11.4296l-.0058.0056Z"
            />
            <path
              fill="#fff"
              d="M.7891 30.3207c.4349 5.6616 2.6038 10.8528 6.008 15.0752l.1565-.1512c3.4969-3.3432 8.0493-6.384 13.5411-9.0328 4.8134-2.324 10.34-4.3176 16.2958-5.8912H.7891Z"
            />
            <path
              fill="#fff"
              d="M22.9884 7.0527c9.76 9.4248 22.0427 15.6576 35.5143 18.0208C56.8789 11.1015 44.6078.2319 29.6981.2319c-3.9377 0-7.6898.7616-11.1171 2.1336a57.4 57.4 0 0 0 4.4074 4.6872Z"
            />
            <path
              fill="#fff"
              d="M9.9576 8.2064c5.6484 5.432 14.672 10.0576 25.5803 13.2384-5.6949-3.108-10.9837-6.9664-15.6057-11.4296a55 55 0 0 1-4.9177-5.2528l-.3827-.4536A29 29 0 0 0 9.7082 7.9656l.2494.2408Z"
            />
            <path
              fill="#fff"
              d="M22.9884 49.4111a57.4 57.4 0 0 0-4.4074 4.6872c3.4215 1.372 7.1794 2.1336 11.1171 2.1336 14.9097 0 27.1808-10.8696 28.8104-24.8472-13.4716 2.3632-25.7543 8.596-35.5143 18.0208l-.0058.0056Z"
            />
            <path
              fill="#fff"
              d="M20.4947 20.2519c-5.4918-2.6488-10.0442-5.6896-13.5411-9.0328l-.1566-.1512C3.3929 15.2903 1.224 20.4815.7891 26.1431h35.9956c-5.9558-1.5736-11.4766-3.5672-16.2958-5.8968l.0058.0056Z"
            />
          </svg>
        );
      case "hyperevm":
        return (
          <svg viewBox="-1 -1 22.5 17.5" role="img" aria-label={`${name} logo`}>
            <path
              fill="#07110f"
              d="M20.4543 7.5399c.0186 1.6787-.3328 3.2829-1.0232 4.8155-.9858 2.1824-3.3492 3.9668-5.5074 2.0674-1.7601-1.5482-2.0867-4.6912-4.7238-5.1513-3.4892-.4228-3.5731 3.6217-5.8526 4.0787C.8066 13.8663-.0361 9.5948.0012 7.6549.0385 5.715.5547 2.9886 2.7627 2.9886c2.5407 0 2.7117 3.8456 5.9366 3.6373 3.1937-.2176 3.2497-4.2187 5.3364-5.9317 1.8005-1.4797 3.9183-.3948 4.9787 1.3866.9827 1.6477 1.415 3.5813 1.4368 5.4591h.0031Z"
            />
          </svg>
        );
      case "avalanche":
        return (
          <svg {...common}>
            <circle cx="16" cy="16" r="16" fill="#e84142" />
            <path
              fill="#fff"
              d="M19.0194 25.9801h8.0272c.7083 0 1.1515-.7604.7969-1.3682l-4.0136-6.8912c-.3546-.6078-1.2392-.6078-1.5938 0l-4.0136 6.8912c-.3546.6078.0886 1.3682.7969 1.3682Zm1.0029-14.7947-3.2988-5.6653c-.3331-.5727-1.1674-.5727-1.5005 0L4.1284 24.5699c-.3649.6273.0914 1.4099.8212 1.4099h6.6059c.7046 0 1.355-.3728 1.7068-.9769l6.76-11.6074c.3984-.6836.3984-1.5264 0-2.2101Z"
            />
          </svg>
        );
      default:
        return <span>{name[0]}</span>;
    }
  })();

  return (
    <span
      className={`chain-logo chain-logo-${slug}`}
      style={
        {
          "--chain-color": chainColors[slug] ?? "#c9ff4b",
        } as React.CSSProperties
      }
      title={name}
    >
      {mark}
    </span>
  );
}
