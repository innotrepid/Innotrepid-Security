class SecurityApp {
  const SecurityApp({
    required this.appId,
    required this.packageName,
    required this.version,
  });

  final String appId;
  final String packageName;
  final String version;

  Map<String, dynamic> toJson() => {
        'appId': appId,
        'packageName': packageName,
        'version': version,
      };
}
