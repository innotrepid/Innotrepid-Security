class SecurityApp {
  const SecurityApp({
    required this.appId,
    required this.packageName,
    required this.version,
    this.buildNumber,
  });

  final String appId;
  final String packageName;
  final String version;
  final String? buildNumber;

  Map<String, dynamic> toJson() => {
        'appId': appId,
        'packageName': packageName,
        'version': version,
        if (buildNumber != null) 'buildNumber': buildNumber,
      };
}