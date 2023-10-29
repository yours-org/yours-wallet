import * as qr from 'qrcode';
import { useEffect, useState } from 'react';
import { styled } from 'styled-components';

const QrImage = styled.img`
  width: 10rem;
  height: 10rem;
  cursor: pointer;
`;

export type QrCodeProps = {
  address: string;
  onClick?: () => void;
};

export const QrCode = (props: QrCodeProps) => {
  const { address, onClick } = props;
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    const uri = `bitcoin:${address}`;
    qr.toDataURL(uri, function (err, url) {
      if (err) {
        console.error(err);
        return;
      }
      setQrUrl(url);
    });
  }, [address]);

  return <>{qrUrl && <QrImage src={qrUrl} alt="Bitcoin QR Code" onClick={onClick} />}</>;
};
