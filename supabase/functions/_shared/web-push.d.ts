declare module "npm:web-push@3.6.7" {
  const webpush: {
    setVapidDetails(
      subject: string,
      publicKey: string,
      privateKey: string,
    ): void;
    sendNotification(subscription: unknown, payload: string): Promise<unknown>;
  };
  export default webpush;
}
